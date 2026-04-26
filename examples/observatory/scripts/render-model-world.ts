#!/usr/bin/env bun

import { resolve } from "node:path";
import { createMetaProjectionKernel } from "../../../L11-projection/bootstrap.ts";
import { registerModelIntrospectionMorphisms } from "../../../L11-projection/model-introspection-m1.ts";
import { AlgebraicKernel, IntentProcessor, ModelLoader } from "../../../L13-facade/index.ts";
import { selectModelWorldModel } from "../custom-handler.ts";

const DIR = import.meta.dir;
const selectedModelId = process.argv[2] ?? "ecommerce";

const kernel = AlgebraicKernel.create();
registerModelIntrospectionMorphisms(kernel);
const loader = new ModelLoader(kernel);
loader.setIntentProcessor(new IntentProcessor(kernel));
loader.loadYamlFile(resolve(DIR, "../../model-world/models/core.model.yaml"));
loader.loadYamlFile(resolve(DIR, "../../model-world/models/ecommerce.model.yaml"));

const projector = await createMetaProjectionKernel(null, {
  yamlPath: resolve(DIR, "../../../L00-model/kernel.model.yaml"),
});
projector.loadYamlFile(resolve(DIR, "../projection/projection.yaml"));
projector.setBinding("models", await loader.listLoadedModels());
const selected = await selectModelWorldModel(loader, selectedModelId);
projector.setBinding("selectedModelId", selected?.summary.modelId ?? null);
projector.setBinding("selectedModelView", selected?.view ?? null);

process.stdout.write(projector.renderHtml("model-world-v2").html);
