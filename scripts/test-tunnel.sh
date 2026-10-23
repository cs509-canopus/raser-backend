#!/usr/bin/env bash
# Smoke-tests the team access path before the database exists:
#   laptop -> EC2 Instance Connect Endpoint -> SSH (22) -> bastion -> stand-in "database" (5432)
# Launches a throwaway t4g.micro that pretends to be Postgres (a tiny HTTP server on 5432),
# reaches it the same way db-connect.sh will reach RDS, then deletes it.
# On failure it prints diagnostics for every hop before cleaning up.
#
#   scripts/test-tunnel.sh                 # run; diagnostics on failure; always cleans up
#   KEEP=1 scripts/test-tunnel.sh          # on failure, leave the stand-in up for manual poking
#   REACHABILITY=1 scripts/test-tunnel.sh  # on failure, also check every hop's rules (free API calls only)
#   ALLOW_COSTS=1                          # permits paid extras; with REACHABILITY=1 that adds
#                                          # AWS VPC Reachability Analyzer (~$0.10 per path, 2 paths)
# In every mode the stand-in runs for ~5 minutes, and the bastion is started if it was idle-stopped
# (it stops itself again after 30 idle minutes).
set -euo pipefail
source "$(dirname "$0")/lib/bastion.sh"
export AWS_DEFAULT_REGION="${AWS_REGION:-us-east-1}"
LOCAL_PORT="${LOCAL_PORT:-5433}"
MARKER="hello from inside raser-shared-vpc"
FORWARD_LOG="$(mktemp -t raser-forward.XXXXXX)"

INSTANCE_ID="" TEST_SG="" FORWARD_PID="" RESULT="fail"

cleanup() {
  set +e
  [[ -n "$FORWARD_PID" ]] && kill "$FORWARD_PID" 2>/dev/null
  if [[ "$RESULT" != "pass" && "${KEEP:-0}" == "1" && -n "$INSTANCE_ID" ]]; then
    echo
    echo "KEEP=1, so the stand-in is still running. Clean up when finished with:"
    echo "  aws ec2 terminate-instances --instance-ids $INSTANCE_ID && aws ec2 wait instance-terminated --instance-ids $INSTANCE_ID && aws ec2 delete-security-group --group-id $TEST_SG"
    return
  fi
  echo "Cleaning up..."
  if [[ -n "$INSTANCE_ID" ]]; then
    aws ec2 terminate-instances --instance-ids "$INSTANCE_ID" >/dev/null
    aws ec2 wait instance-terminated --instance-ids "$INSTANCE_ID"
  fi
  [[ -n "$TEST_SG" ]] && aws ec2 delete-security-group --group-id "$TEST_SG"
  echo "Done. The stand-in is gone; the bastion will stop itself after 30 idle minutes."
}
trap cleanup EXIT

# Every billed AWS call goes through this gate.
costs_allowed() {
  if [[ "${ALLOW_COSTS:-0}" == "1" ]]; then return 0; fi
  echo "   (skipped $1: costs money; rerun with ALLOW_COSTS=1 to allow it)"
  return 1
}

ip2int() { local IFS=.; read -r a b c d <<<"$1"; echo $(( (a << 24) | (b << 16) | (c << 8) | d )); }
ip_in_cidr() {
  local net="${2%/*}" bits="${2#*/}" mask
  mask=$(( bits == 0 ? 0 : (0xFFFFFFFF << (32 - bits)) & 0xFFFFFFFF ))
  (( ($(ip2int "$1") & mask) == ($(ip2int "$net") & mask) ))
}
all_in_cidr() { local cidr="$1" ip; shift; for ip in "$@"; do ip_in_cidr "$ip" "$cidr" || return 1; done; }

# sg_allows <sg-id> <true=egress|false=ingress> <tcp-port> <peer-ip> <peer-sg-id>
sg_allows() {
  local proto from to cidr ref
  while IFS=$'\t' read -r proto from to cidr ref; do
    [[ "$proto" == "-1" || ( "$proto" == "tcp" && "$from" -le "$3" && "$3" -le "$to" ) ]] || continue
    [[ "$ref" == "$5" ]] && return 0
    [[ "$cidr" != "None" ]] && ip_in_cidr "$4" "$cidr" && return 0
  done < <(aws ec2 describe-security-group-rules --filters "Name=group-id,Values=$1" \
    --query "SecurityGroupRules[?IsEgress==\`$2\`].[IpProtocol,FromPort,ToPort,CidrIpv4,ReferencedGroupInfo.GroupId]" \
    --output text)
  return 1
}

# nacl_allows <subnet-id> <true=egress|false=ingress> <tcp-port> <peer-ip>  (first matching rule wins)
nacl_allows() {
  local num proto action cidr pfrom pto
  while IFS=$'\t' read -r num proto action cidr pfrom pto; do
    [[ "$cidr" == "None" ]] && continue # IPv6 rule
    ip_in_cidr "$4" "$cidr" || continue
    if [[ "$proto" != "-1" ]]; then
      [[ "$proto" == "6" && "$pfrom" -le "$3" && "$3" -le "$pto" ]] || continue
    fi
    [[ "$action" == "allow" ]]; return
  done < <(aws ec2 describe-network-acls --filters "Name=association.subnet-id,Values=$1" \
    --query "NetworkAcls[0].Entries[?Egress==\`$2\`] | sort_by(@, &RuleNumber)[].[RuleNumber,Protocol,RuleAction,CidrBlock,PortRange.From,PortRange.To]" \
    --output text)
  return 1
}

instance_state_is() { [[ "$(aws ec2 describe-instances --instance-ids "$1" \
  --query 'Reservations[0].Instances[0].State.Name' --output text)" == "$2" ]]; }
standin_started() {
  aws ec2 get-console-output --instance-id "$INSTANCE_ID" --latest --query Output --output text 2>/dev/null \
    | grep -q 'raser-standin'
}

FAILED_HOPS=0
hop() { # hop <description> <command...>
  local desc="$1"; shift
  if "$@"; then echo "   [ok]   $desc"; else echo "   [FAIL] $desc"; FAILED_HOPS=$((FAILED_HOPS + 1)); fi
}

# check_leg <label> <src-sg> <src-ip> <src-subnet> <dst-sg> <dst-ip> <dst-subnet> <port>
check_leg() {
  local label="$1" ssg="$2" sip="$3" ssub="$4" dsg="$5" dip="$6" dsub="$7" port="$8" ephemeral=49152
  hop "$label: source SG $ssg allows OUTBOUND tcp/$port" sg_allows "$ssg" true "$port" "$dip" "$dsg"
  hop "$label: destination SG $dsg allows INBOUND tcp/$port" sg_allows "$dsg" false "$port" "$sip" "$ssg"
  if [[ "$ssub" == "$dsub" ]]; then
    echo "   [ok]   $label: same subnet, so network ACLs aren't evaluated"
    return
  fi
  # ACLs are stateless: the reply (to an ephemeral port) needs its own allow rules.
  hop "$label: source subnet ACL allows OUTBOUND tcp/$port" nacl_allows "$ssub" true "$port" "$dip"
  hop "$label: destination subnet ACL allows INBOUND tcp/$port" nacl_allows "$dsub" false "$port" "$sip"
  hop "$label: destination subnet ACL allows OUTBOUND reply (tcp/$ephemeral)" nacl_allows "$dsub" true "$ephemeral" "$sip"
  hop "$label: source subnet ACL allows INBOUND reply (tcp/$ephemeral)" nacl_allows "$ssub" false "$ephemeral" "$dip"
}

# Free, hop-by-hop version of what Reachability Analyzer checks, from describe-* calls only.
free_reachability_check() {
  local eice_subnet preserve eice_vpc eni eni_ip vpc_cidr
  read -r eice_subnet preserve eice_vpc eni < <(aws ec2 describe-instance-connect-endpoints \
    --instance-connect-endpoint-ids "$EICE_ID" \
    --query 'InstanceConnectEndpoints[0].[SubnetId,PreserveClientIp,VpcId,NetworkInterfaceIds[0]]' --output text)
  eni_ip="$(aws ec2 describe-network-interfaces --network-interface-ids "$eni" \
    --query 'NetworkInterfaces[0].PrivateIpAddress' --output text)"
  vpc_cidr="$(aws ec2 describe-vpcs --vpc-ids "$VPC_ID" --query 'Vpcs[0].CidrBlock' --output text)"
  echo "   endpoint $eni_ip -> bastion $BASTION_IP (tcp/22) -> stand-in $TARGET_IP (tcp/5432)"

  hop "endpoint is in the same VPC as the bastion and stand-in" [ "$eice_vpc" == "$VPC_ID" ]
  hop "endpoint does not preserve client IPs (source = its ENI, so SG rules can match)" [ "$preserve" == "False" ]
  hop "routing: all three addresses are inside $vpc_cidr (VPC 'local' route)" \
    all_in_cidr "$vpc_cidr" "$eni_ip" "$BASTION_IP" "$TARGET_IP"
  hop "bastion is running" instance_state_is "$BASTION_ID" running
  check_leg "endpoint->bastion" "$EIC_SG" "$eni_ip" "$eice_subnet" "$BASTION_SG" "$BASTION_IP" "$BASTION_SUBNET" 22
  check_leg "bastion->stand-in" "$BASTION_SG" "$BASTION_IP" "$BASTION_SUBNET" "$TEST_SG" "$TARGET_IP" "$SUBNET_ID" 5432
  hop "stand-in's boot log says the web server started" standin_started
  if (( FAILED_HOPS == 0 )); then
    echo "   => Network path looks open. If requests still fail, the cause is in the SSH/tunnel log above."
  fi
}

# run_analyzer <source> <destination> <port>  (one billed analysis)
run_analyzer() {
  local path_id analysis_id status
  path_id="$(aws ec2 create-network-insights-path --source "$1" --destination "$2" \
    --protocol tcp --destination-port "$3" \
    --query NetworkInsightsPath.NetworkInsightsPathId --output text)" || return 0
  analysis_id="$(aws ec2 start-network-insights-analysis --network-insights-path-id "$path_id" \
    --query NetworkInsightsAnalysis.NetworkInsightsAnalysisId --output text)"
  for _ in $(seq 1 30); do
    status="$(aws ec2 describe-network-insights-analyses --network-insights-analysis-ids "$analysis_id" \
      --query 'NetworkInsightsAnalyses[0].Status' --output text)"
    [[ "$status" != "running" ]] && break
    sleep 5
  done
  aws ec2 describe-network-insights-analyses --network-insights-analysis-ids "$analysis_id" \
    --query 'NetworkInsightsAnalyses[0].{Status:Status,PathFound:NetworkPathFound,Blockers:Explanations[].{Code:ExplanationCode,Direction:Direction,Component:Component.Id,SecurityGroup:SecurityGroup.Id}}' \
    --output json
  aws ec2 delete-network-insights-analysis --network-insights-analysis-id "$analysis_id" >/dev/null
  aws ec2 delete-network-insights-path --network-insights-path-id "$path_id" >/dev/null
}

paid_reachability_analyzer() {
  costs_allowed "VPC Reachability Analyzer (~\$0.20 for 2 paths)" || return 0
  local eni
  eni="$(aws ec2 describe-instance-connect-endpoints --instance-connect-endpoint-ids "$EICE_ID" \
    --query 'InstanceConnectEndpoints[0].NetworkInterfaceIds[0]' --output text)"
  echo "   endpoint -> bastion, tcp/22:"
  run_analyzer "$eni" "$BASTION_ID" 22
  echo "   bastion -> stand-in, tcp/5432:"
  run_analyzer "$BASTION_ID" "$INSTANCE_ID" 5432
}

sg_table() { # sg_table <sg-id> <true=egress|false=ingress>
  aws ec2 describe-security-group-rules --filters "Name=group-id,Values=$1" \
    --query "SecurityGroupRules[?IsEgress==\`$2\`].[IpProtocol,FromPort,ToPort,CidrIpv4,ReferencedGroupInfo.GroupId]" \
    --output table
}

diagnostics() {
  set +e
  echo
  echo "================ DIAGNOSTICS (paste this back) ================"
  echo "-- SSH forward process: $(kill -0 "$FORWARD_PID" 2>/dev/null && echo running || echo EXITED)"
  echo "-- SSH / tunnel log ($FORWARD_LOG):"
  tail -n 30 "$FORWARD_LOG" | sed 's/^/   /'

  echo "-- Endpoint:"
  aws ec2 describe-instance-connect-endpoints --instance-connect-endpoint-ids "$EICE_ID" \
    --query 'InstanceConnectEndpoints[0].{State:State,Vpc:VpcId,Subnet:SubnetId,PreserveClientIp:PreserveClientIp,SecurityGroups:SecurityGroupIds}' \
    --output json
  echo "-- Bastion:"
  aws ec2 describe-instance-status --instance-ids "$BASTION_ID" --include-all-instances \
    --query 'InstanceStatuses[0].{State:InstanceState.Name,SystemCheck:SystemStatus.Status,InstanceCheck:InstanceStatus.Status}' \
    --output json

  echo "-- Endpoint SG ($EIC_SG) OUTBOUND (need: tcp 22 -> $BASTION_SG):"; sg_table "$EIC_SG" true
  echo "-- Bastion SG ($BASTION_SG) INBOUND (need: tcp 22 from $EIC_SG):"; sg_table "$BASTION_SG" false
  echo "-- Bastion SG ($BASTION_SG) OUTBOUND (need: tcp 5432 -> 10.0.0.0/16):"; sg_table "$BASTION_SG" true
  echo "-- Stand-in SG ($TEST_SG) INBOUND (need: tcp 5432 from $BASTION_SG):"; sg_table "$TEST_SG" false

  echo "-- Network ACLs on the bastion's and stand-in's subnets (default = rule 100 allow all):"
  aws ec2 describe-network-acls --filters "Name=association.subnet-id,Values=$BASTION_SUBNET,$SUBNET_ID" \
    --query 'NetworkAcls[].Entries[].[Egress,RuleNumber,Protocol,RuleAction,CidrBlock]' --output table

  echo "-- Stand-in status:"
  aws ec2 describe-instance-status --instance-ids "$INSTANCE_ID" --include-all-instances \
    --query 'InstanceStatuses[0].{State:InstanceState.Name,SystemCheck:SystemStatus.Status,InstanceCheck:InstanceStatus.Status}' \
    --output json
  echo "-- Stand-in boot log (did the user-data web server start?):"
  aws ec2 get-console-output --instance-id "$INSTANCE_ID" --latest --query Output --output text 2>/dev/null \
    | grep -iE 'raser-standin|scripts-user|error|fail' | tail -n 15 | sed 's/^/   /'

  if [[ "${REACHABILITY:-0}" == "1" ]]; then
    echo "-- Hop-by-hop rule check (free):"
    free_reachability_check
    echo "-- VPC Reachability Analyzer (paid):"
    paid_reachability_analyzer
  fi
  echo "==============================================================="
}

echo "0/6 Pre-flight checks"
echo "    $(aws --version 2>&1)   (need aws-cli/2.12 or newer)"
echo "    Caller: $(aws sts get-caller-identity --query Arn --output text)   Region: $AWS_DEFAULT_REGION"
for tool in ssh ssh-keygen curl; do
  command -v "$tool" >/dev/null || { echo "FAIL: '$tool' is not installed."; exit 1; }
done
if port_in_use "$LOCAL_PORT"; then
  echo "FAIL: something on your laptop is already listening on localhost:$LOCAL_PORT."
  echo "      Stop it or rerun with LOCAL_PORT=15432 scripts/test-tunnel.sh"
  exit 1
fi

echo "1/6 Reading NetworkStack outputs"
VPC_ID="$(stack_output NetworkStack VpcId)"
EICE_ID="$(stack_output NetworkStack EicEndpointId)"
BASTION_ID="$(stack_output NetworkStack BastionInstanceId)"
read -r EICE_STATE EIC_SG < <(aws ec2 describe-instance-connect-endpoints \
  --instance-connect-endpoint-ids "$EICE_ID" \
  --query 'InstanceConnectEndpoints[0].[State, SecurityGroupIds[0]]' --output text)
read -r BASTION_SG BASTION_SUBNET < <(aws ec2 describe-instances --instance-ids "$BASTION_ID" \
  --query 'Reservations[0].Instances[0].[SecurityGroups[0].GroupId, SubnetId]' --output text)
# Put the stand-in in the OTHER subnet when possible, so the cross-AZ path RDS may need is exercised.
SUBNET_ID="$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[?SubnetId!='$BASTION_SUBNET'] | [0].SubnetId" --output text)"
[[ "$SUBNET_ID" == "None" ]] && SUBNET_ID="$BASTION_SUBNET"
echo "    VPC $VPC_ID | endpoint $EICE_ID ($EICE_STATE) | bastion $BASTION_ID (SG $BASTION_SG)"
[[ "$EICE_STATE" == "create-complete" ]] || { echo "Endpoint not ready yet"; exit 1; }

echo "2/6 Creating a temporary SG that mirrors the future DB's (5432 from the bastion's SG only)"
TEST_SG="$(aws ec2 create-security-group --vpc-id "$VPC_ID" --group-name "raser-tunnel-test-$$" \
  --description "Temporary: tunnel smoke test" --query GroupId --output text)"
aws ec2 authorize-security-group-ingress --group-id "$TEST_SG" \
  --protocol tcp --port 5432 --source-group "$BASTION_SG" >/dev/null

echo "3/6 Launching a stand-in 'database' (Amazon Linux 2023, HTTP server on 5432) in $SUBNET_ID"
USER_DATA="#!/bin/bash
mkdir -p /srv && echo '$MARKER' > /srv/index.html
cd /srv && nohup python3 -m http.server 5432 >/var/log/standin.log 2>&1 &
echo 'raser-standin: web server started on 5432' > /dev/console"
INSTANCE_ID="$(aws ec2 run-instances \
  --image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 \
  --instance-type t4g.micro --subnet-id "$SUBNET_ID" --security-group-ids "$TEST_SG" \
  --user-data "$USER_DATA" \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=raser-tunnel-test}]' \
  --query 'Instances[0].InstanceId' --output text)"

echo "4/6 Making sure the bastion is running, then waiting for the stand-in to boot (usually 2-4 min)"
ensure_bastion_running
BASTION_IP="$(aws ec2 describe-instances --instance-ids "$BASTION_ID" \
  --query 'Reservations[0].Instances[0].PrivateIpAddress' --output text)"
aws ec2 wait instance-status-ok --instance-ids "$INSTANCE_ID"
TARGET_IP="$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PrivateIpAddress' --output text)"
echo "    bastion $BASTION_IP | stand-in $INSTANCE_ID at $TARGET_IP"

echo "5/6 Opening the path: localhost:$LOCAL_PORT -> $EICE_ID -> ssh $BASTION_ID -> $TARGET_IP:5432"
if ! start_forward "$LOCAL_PORT" "$TARGET_IP" 5432 "$FORWARD_LOG"; then
  echo "FAIL: couldn't SSH to the bastion through the endpoint."
  diagnostics
  exit 1
fi

echo "6/6 Requesting through the tunnel"
RESTARTED=0
for attempt in $(seq 1 6); do
  if ! kill -0 "$FORWARD_PID" 2>/dev/null; then
    (( RESTARTED )) && break
    echo "    ! SSH forward exited (attempt $attempt); restarting it once"
    RESTARTED=1
    start_forward "$LOCAL_PORT" "$TARGET_IP" 5432 "$FORWARD_LOG" || break
  fi
  if RESPONSE="$(curl -sS --max-time 8 "http://localhost:$LOCAL_PORT/" 2>&1)" && [[ "$RESPONSE" == *"$MARKER"* ]]; then
    RESULT="pass"
    echo
    echo "PASS: got \"$RESPONSE\" from inside the VPC through the endpoint and bastion (attempt $attempt)."
    exit 0
  fi
  echo "    attempt $attempt: ${RESPONSE:-no response}"
  sleep 10
done

echo "FAIL: no correct response through the tunnel."
diagnostics
exit 1
