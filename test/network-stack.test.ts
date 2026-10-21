import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Match, Template } from "aws-cdk-lib/assertions";
import { NetworkStack } from "../lib/network-stack";

// Tests describe the intended architecture (diagram + design notes), not implementation details:
//   - one shared VPC, private isolated subnets in exactly 2 AZs
//   - nothing billed by the hour except one tiny bastion that stops itself when idle,
//     and no path to or from the internet
//   - a free S3 gateway endpoint
//   - a "DB client" SG for Lambdas
//   - team access: laptop -> EC2 Instance Connect Endpoint -> SSH (22) -> bastion -> Postgres (5432).
//     The endpoint only tunnels to ports 22/3389, so it must never need 5432 itself.

const ACCOUNT = "123456789012";
const REGION = "us-east-1";
const POSTGRES_PORT = 5432;
const SSH_PORT = 22;

type Resources = Record<string, { Type: string; Properties?: any }>;

let stack: NetworkStack;
let template: Template;

beforeAll(() => {
  const app = new cdk.App({
    // Pre-seed the AZ lookup so synth is deterministic and needs no AWS credentials.
    context: {
      [`availability-zones:account=${ACCOUNT}:region=${REGION}`]: [
        "us-east-1a",
        "us-east-1b",
        "us-east-1c",
      ],
    },
  });
  stack = new NetworkStack(app, "NetworkStack", {});
  template = Template.fromStack(stack);
});

// ---------- helpers ----------

const logicalIdOf = (
  construct: { node: { defaultChild?: any } } | cdk.CfnElement,
): string =>
  stack.getLogicalId(
    (construct instanceof cdk.CfnElement
      ? construct
      : construct.node.defaultChild) as cdk.CfnElement,
  );

const onlyResourceOfType = (type: string): [string, any] => {
  const found = Object.entries(template.findResources(type) as Resources);
  expect(found).toHaveLength(1);
  return [found[0][0], found[0][1].Properties];
};

const refersTo = (value: unknown, logicalId: string): boolean =>
  JSON.stringify(value).includes(`"${logicalId}"`);

/** All rules for a security group, whether CDK wrote them inline or as standalone resources. */
function rulesFor(sgLogicalId: string, direction: "Ingress" | "Egress"): any[] {
  const sg = template.findResources("AWS::EC2::SecurityGroup")[sgLogicalId];
  const inline: any[] = sg.Properties?.[`SecurityGroup${direction}`] ?? [];
  const standalone = Object.values(
    template.findResources(`AWS::EC2::SecurityGroup${direction}`) as Resources,
  )
    .map((r) => r.Properties)
    .filter((p) => refersTo(p.GroupId, sgLogicalId));
  return [...inline, ...standalone];
}

/** The other side of a rule: a security group (ingress source / egress destination) or a CIDR. */
const peerOf = (rule: any) =>
  rule.SourceSecurityGroupId ?? rule.DestinationSecurityGroupId ?? rule.CidrIp;

const coversTcpPort = (rule: any, port: number): boolean =>
  rule.IpProtocol === "-1" ||
  (rule.IpProtocol === "tcp" && rule.FromPort <= port && port <= rule.ToPort);

const vpcCidr = () => ({ "Fn::GetAtt": [logicalIdOf(stack.vpc), "CidrBlock"] });
const sgId = (sg: ec2.ISecurityGroup) => ({
  "Fn::GetAtt": [logicalIdOf(sg as ec2.SecurityGroup), "GroupId"],
});

const bastionProps = () => onlyResourceOfType("AWS::EC2::Instance")[1];

// ---------- VPC ----------

describe("VPC", () => {
  test("exactly one VPC, 10.0.0.0/16, with DNS enabled (RDS endpoints and the S3 endpoint need it)", () => {
    template.resourceCountIs("AWS::EC2::VPC", 1);
    template.hasResourceProperties("AWS::EC2::VPC", {
      CidrBlock: "10.0.0.0/16",
      EnableDnsHostnames: true,
      EnableDnsSupport: true,
    });
  });

  test("is named raser-shared-vpc so stage stacks can find it with Vpc.fromLookup", () => {
    template.hasResourceProperties("AWS::EC2::VPC", {
      Tags: Match.arrayWith([{ Key: "Name", Value: "raser-shared-vpc" }]),
    });
  });

  test("default security group is stripped of its rules", () => {
    template.resourceCountIs("Custom::VpcRestrictDefaultSG", 1);
  });

  test("exposes only isolated subnets to consumers (DatabaseStack, Lambdas)", () => {
    expect(stack.vpc.isolatedSubnets).toHaveLength(2);
    expect(stack.vpc.publicSubnets).toHaveLength(0);
    expect(stack.vpc.privateSubnets).toHaveLength(0);
  });
});

// ---------- Subnets & routing ----------

describe("Subnets and routing", () => {
  test("two subnets, in two different AZs (RDS subnet groups require 2 AZs)", () => {
    const subnets = Object.values(
      template.findResources("AWS::EC2::Subnet") as Resources,
    );
    expect(subnets).toHaveLength(2);
    const azs = new Set(
      subnets.map((s) => JSON.stringify(s.Properties.AvailabilityZone)),
    );
    expect(azs.size).toBe(2);
  });

  test("subnets are isolated: tagged as such and never assign public IPs", () => {
    const subnets = Object.values(
      template.findResources("AWS::EC2::Subnet") as Resources,
    );
    for (const subnet of subnets) {
      expect(subnet.Properties.MapPublicIpOnLaunch).toBe(false);
      expect(subnet.Properties.Tags).toEqual(
        expect.arrayContaining([
          { Key: "aws-cdk:subnet-type", Value: "Isolated" },
        ]),
      );
    }
  });

  test("each subnet has its own route table", () => {
    template.resourceCountIs("AWS::EC2::RouteTable", 2);
    template.resourceCountIs("AWS::EC2::SubnetRouteTableAssociation", 2);
  });

  test("no routes leave the VPC (no default route to an internet or NAT gateway)", () => {
    template.resourceCountIs("AWS::EC2::Route", 0);
  });
});

// ---------- Cost guards ----------

describe("Cost guards: nothing billed by the hour except the bastion, no internet path", () => {
  test.each([
    ["AWS::EC2::NatGateway", "NAT gateway (~$33/mo each)"],
    ["AWS::EC2::EIP", "Elastic IP (public IPv4 is billed hourly)"],
    ["AWS::EC2::InternetGateway", "internet gateway"],
    ["AWS::EC2::VPCGatewayAttachment", "internet/VPN gateway attachment"],
    ["AWS::EC2::EgressOnlyInternetGateway", "IPv6 egress gateway"],
    ["AWS::EC2::FlowLog", "VPC flow logs (CloudWatch ingestion cost)"],
    ["AWS::RDS::DBInstance", "database (belongs in DatabaseStack)"],
  ])("creates no %s — %s", (type) => {
    template.resourceCountIs(type, 0);
  });

  test("no interface VPC endpoints (~$7/mo per AZ each)", () => {
    const interfaceEndpoints = template.findResources("AWS::EC2::VPCEndpoint", {
      Properties: { VpcEndpointType: "Interface" },
    });
    expect(Object.keys(interfaceEndpoints)).toHaveLength(0);
  });

  test("the only EC2 instance is the bastion, and it is the smallest size available to free tier (t4g.micro)", () => {
    expect(bastionProps().InstanceType).toBe("t4g.micro");
  });
});

// ---------- S3 gateway endpoint ----------

describe("S3 gateway endpoint", () => {
  test("exactly one VPC endpoint, and it is a free S3 Gateway endpoint", () => {
    const [, props] = onlyResourceOfType("AWS::EC2::VPCEndpoint");
    expect(props.VpcEndpointType).toBe("Gateway");
    expect(JSON.stringify(props.ServiceName)).toMatch(/\.s3"/);
    expect(refersTo(props.VpcId, logicalIdOf(stack.vpc))).toBe(true);
  });

  test("is routed from every subnet in the VPC", () => {
    const [, props] = onlyResourceOfType("AWS::EC2::VPCEndpoint");
    const routeTableIds = Object.keys(
      template.findResources("AWS::EC2::RouteTable"),
    );
    expect(props.RouteTableIds).toHaveLength(routeTableIds.length);
    for (const id of routeTableIds) {
      expect(refersTo(props.RouteTableIds, id)).toBe(true);
    }
  });
});

// ---------- Security groups ----------

describe("Security groups", () => {
  test("exactly three, all in the shared VPC: Lambda DB clients, EIC endpoint, bastion", () => {
    template.resourceCountIs("AWS::EC2::SecurityGroup", 3);
    for (const sg of [
      stack.lambdaSecurityGroup,
      stack.eicSecurityGroup,
      stack.bastionSecurityGroup,
    ]) {
      const props = template.findResources("AWS::EC2::SecurityGroup")[
        logicalIdOf(sg)
      ].Properties;
      expect(refersTo(props.VpcId, logicalIdOf(stack.vpc))).toBe(true);
    }
  });

  describe("Lambda DB-client SG", () => {
    test("accepts no inbound traffic (nothing initiates connections to Lambdas)", () => {
      expect(
        rulesFor(logicalIdOf(stack.lambdaSecurityGroup), "Ingress"),
      ).toHaveLength(0);
    });

    test("can open connections to Postgres", () => {
      const egress = rulesFor(logicalIdOf(stack.lambdaSecurityGroup), "Egress");
      expect(egress.some((r) => coversTcpPort(r, POSTGRES_PORT))).toBe(true);
    });

    test("can reach S3 over HTTPS through the gateway endpoint", () => {
      const egress = rulesFor(logicalIdOf(stack.lambdaSecurityGroup), "Egress");
      expect(egress.some((r) => coversTcpPort(r, 443))).toBe(true);
    });
  });

  describe("EIC endpoint SG", () => {
    test("accepts no inbound traffic", () => {
      expect(
        rulesFor(logicalIdOf(stack.eicSecurityGroup), "Ingress"),
      ).toHaveLength(0);
    });

    test("egress is exactly one rule: SSH (22) to the bastion SG", () => {
      const egress = rulesFor(logicalIdOf(stack.eicSecurityGroup), "Egress");
      expect(egress).toHaveLength(1);
      expect(egress[0]).toMatchObject({
        IpProtocol: "tcp",
        FromPort: SSH_PORT,
        ToPort: SSH_PORT,
      });
      expect(peerOf(egress[0])).toEqual(sgId(stack.bastionSecurityGroup));
    });

    test("cannot reach Postgres directly (EIC only tunnels to 22/3389 anyway)", () => {
      const egress = rulesFor(logicalIdOf(stack.eicSecurityGroup), "Egress");
      expect(egress.some((r) => coversTcpPort(r, POSTGRES_PORT))).toBe(false);
    });
  });

  describe("Bastion SG", () => {
    test("ingress is exactly one rule: SSH (22) from the EIC endpoint SG", () => {
      const ingress = rulesFor(
        logicalIdOf(stack.bastionSecurityGroup),
        "Ingress",
      );
      expect(ingress).toHaveLength(1);
      expect(ingress[0]).toMatchObject({
        IpProtocol: "tcp",
        FromPort: SSH_PORT,
        ToPort: SSH_PORT,
      });
      expect(peerOf(ingress[0])).toEqual(sgId(stack.eicSecurityGroup));
    });

    test("egress is exactly one rule: Postgres (5432) to addresses inside the VPC", () => {
      const egress = rulesFor(
        logicalIdOf(stack.bastionSecurityGroup),
        "Egress",
      );
      expect(egress).toHaveLength(1);
      expect(egress[0]).toMatchObject({
        IpProtocol: "tcp",
        FromPort: POSTGRES_PORT,
        ToPort: POSTGRES_PORT,
      });
      expect(peerOf(egress[0])).toEqual(vpcCidr());
    });
  });

  test("no rule anywhere in this stack admits traffic from the internet", () => {
    for (const id of Object.keys(
      template.findResources("AWS::EC2::SecurityGroup"),
    )) {
      for (const rule of rulesFor(id, "Ingress")) {
        expect(rule.CidrIp).not.toBe("0.0.0.0/0");
        expect(rule.CidrIpv6).not.toBe("::/0");
      }
    }
  });
});

// ---------- EC2 Instance Connect Endpoint ----------

describe("EC2 Instance Connect Endpoint (team entry point)", () => {
  test("exactly one endpoint", () => {
    template.resourceCountIs("AWS::EC2::InstanceConnectEndpoint", 1);
  });

  test("lives in one of the shared VPC isolated subnets", () => {
    const [, props] = onlyResourceOfType("AWS::EC2::InstanceConnectEndpoint");
    const isolatedSubnetIds = stack.vpc.isolatedSubnets.map((s) =>
      logicalIdOf(s),
    );
    expect(isolatedSubnetIds.some((id) => refersTo(props.SubnetId, id))).toBe(
      true,
    );
  });

  test("uses only the EIC security group (not the VPC default SG)", () => {
    const [, props] = onlyResourceOfType("AWS::EC2::InstanceConnectEndpoint");
    expect(props.SecurityGroupIds).toEqual([sgId(stack.eicSecurityGroup)]);
  });

  test("does not preserve client IPs, so the bastion can allow it by security group", () => {
    template.hasResourceProperties("AWS::EC2::InstanceConnectEndpoint", {
      PreserveClientIp: false,
    });
  });

  test("exposes its endpoint ID for the team IAM policy in DatabaseStack", () => {
    const [eicLogicalId] = onlyResourceOfType(
      "AWS::EC2::InstanceConnectEndpoint",
    );
    expect(stack.resolve(stack.eicEndpointId)).toEqual({
      "Fn::GetAtt": [eicLogicalId, "Id"],
    });
  });
});

// ---------- Bastion ----------

describe("Bastion (SSH hop from the EIC endpoint to Postgres)", () => {
  test("exactly one instance, in an isolated subnet of the shared VPC", () => {
    const props = bastionProps();
    const subnetRef = props.SubnetId ?? props.NetworkInterfaces?.[0]?.SubnetId;
    const isolatedSubnetIds = stack.vpc.isolatedSubnets.map((s) =>
      logicalIdOf(s),
    );
    expect(isolatedSubnetIds.some((id) => refersTo(subnetRef, id))).toBe(true);
  });

  test("never gets a public IP", () => {
    expect(
      bastionProps().NetworkInterfaces?.[0]?.AssociatePublicIpAddress,
    ).not.toBe(true);
  });

  test("uses only the bastion security group", () => {
    const props = bastionProps();
    const sgs =
      props.SecurityGroupIds ?? props.NetworkInterfaces?.[0]?.GroupSet;
    expect(sgs).toEqual([sgId(stack.bastionSecurityGroup)]);
  });

  test("runs Amazon Linux 2023 on ARM (EC2 Instance Connect is preinstalled; t4g needs arm64)", () => {
    const imageParams = template.findParameters("*", {
      Default: Match.stringLikeRegexp("al2023.*arm64"),
    });
    expect(Object.keys(imageParams)).toHaveLength(1);
    expect(bastionProps().ImageId).toEqual({
      Ref: Object.keys(imageParams)[0],
    });
  });

  test("requires IMDSv2 (set on the instance or on the launch template it uses)", () => {
    const props = bastionProps();
    const onInstance = props.MetadataOptions?.HttpTokens === "required";
    const viaLaunchTemplate = Object.entries(
      template.findResources("AWS::EC2::LaunchTemplate") as Resources,
    ).some(
      ([id, lt]) =>
        lt.Properties?.LaunchTemplateData?.MetadataOptions?.HttpTokens ===
          "required" && refersTo(props.LaunchTemplate, id),
    );
    expect(onInstance || viaLaunchTemplate).toBe(true);
  });

  test("root volume is small, gp3 and encrypted", () => {
    const [mapping] = bastionProps().BlockDeviceMappings;
    expect(mapping.Ebs).toMatchObject({ VolumeType: "gp3", Encrypted: true });
    expect(mapping.Ebs.VolumeSize).toBeLessThanOrEqual(8);
  });

  test("a shutdown from inside the OS stops (not terminates) the instance", () => {
    expect(bastionProps().InstanceInitiatedShutdownBehavior).toBe("stop");
  });

  test("stops itself when idle (user data installs an idle-shutdown timer)", () => {
    const userData = JSON.stringify(bastionProps().UserData);
    expect(userData).toMatch(/OnUnitActiveSec/);
    expect(userData).toMatch(/shutdown -h now/);
    expect(userData).toMatch(/systemctl enable --now [\w-]+\.timer/);
  });

  test("exposes the bastion and its SG for DatabaseStack", () => {
    expect(stack.resolve(stack.bastion.instanceId)).toEqual({
      Ref: logicalIdOf(stack.bastion.instance),
    });
  });
});

// ---------- Outputs ----------

describe("Outputs", () => {
  test("VPC ID, EIC endpoint ID and bastion instance ID are printed after deploy (scripts read them)", () => {
    const [eicLogicalId] = onlyResourceOfType(
      "AWS::EC2::InstanceConnectEndpoint",
    );
    template.hasOutput("VpcId", { Value: { Ref: logicalIdOf(stack.vpc) } });
    template.hasOutput("EicEndpointId", {
      Value: { "Fn::GetAtt": [eicLogicalId, "Id"] },
    });
    template.hasOutput("BastionInstanceId", {
      Value: { Ref: logicalIdOf(stack.bastion.instance) },
    });
  });
});

// Keep the public surface DatabaseStack depends on from silently changing type.
test("public properties have the expected types", () => {
  expect(stack.vpc).toBeInstanceOf(ec2.Vpc);
  expect(stack.lambdaSecurityGroup).toBeInstanceOf(ec2.SecurityGroup);
  expect(stack.eicSecurityGroup).toBeInstanceOf(ec2.SecurityGroup);
  expect(stack.bastionSecurityGroup).toBeInstanceOf(ec2.SecurityGroup);
  expect(stack.bastion).toBeInstanceOf(ec2.Instance);
  expect(typeof stack.eicEndpointId).toBe("string");
});
