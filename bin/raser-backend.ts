#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { RaserStage } from "../lib/raser-stage";
import { DatabaseStack } from "../lib/database-stack";
import { NetworkStack } from "../lib/network-stack";

const app = new cdk.App();

// Stacks shared across all stages
const databaseStack = new DatabaseStack(app, "DatabaseStack", {});
const networkStack = new NetworkStack(app, "NetworkStack", {});

// Top-level shared environments
const productionStage = new RaserStage(app, "production", {});
const stagingStage = new RaserStage(app, "staging", {});

// Developer stages
const asuyerStage = new RaserStage(app, "asuyer", {});
const mseugiStage = new RaserStage(app, "msegui", {});
const kchangStage = new RaserStage(app, "kchang", {});
const kgargStage = new RaserStage(app, "kgarg", {});
