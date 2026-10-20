#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { RaserStage } from "../lib/raser-stage";

const app = new cdk.App();

// Shared stages
const productionStage = new RaserStage(app, "production", {});
const stagingStage = new RaserStage(app, "staging", {});

// Developer stages
const asuyerStage = new RaserStage(app, "asuyer", {});
const mseugiStage = new RaserStage(app, "msegui", {});
const kchangStage = new RaserStage(app, "kchang", {});
const kgargStage = new RaserStage(app, "kgarg", {});
