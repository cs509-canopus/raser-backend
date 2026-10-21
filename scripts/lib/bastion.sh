# Shared helpers for reaching private resources through EIC endpoint -> SSH -> bastion.
# Sourced by db-connect.sh and test-tunnel.sh. Expects AWS_DEFAULT_REGION to be set.

# stack_output <stack-name> <output-key>
stack_output() {
  aws cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text
}

# port_in_use <local-port>
port_in_use() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# Starts the bastion if its idle timer stopped it. Needs $BASTION_ID.
ensure_bastion_running() {
  local state
  state="$(aws ec2 describe-instances --instance-ids "$BASTION_ID" \
    --query 'Reservations[0].Instances[0].State.Name' --output text)"
  case "$state" in
    running) return 0 ;;
    pending) ;;
    stopping)
      echo "    bastion is stopping; waiting so it can be started again..."
      aws ec2 wait instance-stopped --instance-ids "$BASTION_ID"
      aws ec2 start-instances --instance-ids "$BASTION_ID" >/dev/null ;;
    stopped)
      echo "    bastion was stopped (idle); starting it (~30 s)..."
      aws ec2 start-instances --instance-ids "$BASTION_ID" >/dev/null ;;
    *) echo "    ! bastion is '$state'; can't use it"; return 1 ;;
  esac
  aws ec2 wait instance-running --instance-ids "$BASTION_ID"
}

# start_forward <local-port> <remote-host> <remote-port> <log-file>
# SSH to the bastion through the EIC endpoint and forward localhost:<local-port> to <remote-host>:<remote-port>.
# Sets FORWARD_PID. Retries while a freshly started bastion is still booting sshd.
# Needs $BASTION_ID and $EICE_ID.
start_forward() {
  local local_port="$1" remote_host="$2" remote_port="$3" log="$4" key_dir attempt
  key_dir="$(mktemp -d)"
  ssh-keygen -q -t ed25519 -N '' -C raser-one-time -f "$key_dir/key"
  for attempt in 1 2 3 4 5 6; do
    # The public key is accepted for 60 seconds, so push it right before every attempt.
    if ! aws ec2-instance-connect send-ssh-public-key --instance-id "$BASTION_ID" \
      --instance-os-user ec2-user --ssh-public-key "file://$key_dir/key.pub" >>"$log" 2>&1; then
      echo "    ! couldn't push the SSH key (see $log)"; rm -rf "$key_dir"; return 1
    fi
    # Host-key checking is off because the bastion is replaced whenever its AMI updates;
    # the connection is already authenticated end-to-end by IAM through the EIC endpoint.
    ssh -i "$key_dir/key" -N -L "127.0.0.1:$local_port:$remote_host:$remote_port" \
      -o "ProxyCommand=aws ec2-instance-connect open-tunnel --instance-id $BASTION_ID --instance-connect-endpoint-id $EICE_ID" \
      -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
      -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
      "ec2-user@$BASTION_ID" >>"$log" 2>&1 &
    FORWARD_PID=$!
    for _ in $(seq 1 20); do
      if port_in_use "$local_port"; then rm -rf "$key_dir"; return 0; fi
      kill -0 "$FORWARD_PID" 2>/dev/null || break
      sleep 1
    done
    kill "$FORWARD_PID" 2>/dev/null || true
    echo "    ! SSH forward not up yet (attempt $attempt/6); retrying in 10 s..."
    sleep 10
  done
  rm -rf "$key_dir"
  echo "    ! couldn't open the SSH forward. Last log lines:"
  tail -n 8 "$log" | sed 's/^/      /'
  return 1
}
