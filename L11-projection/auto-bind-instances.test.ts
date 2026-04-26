import { describe, expect, test } from "bun:test";
import { AlgebraicKernel, IntentProcessor, ModelLoader } from "../L13-facade/index.ts";
import { createMetaProjectionKernel } from "./bootstrap.ts";
import { ProjectionKernel } from "./projection-kernel.ts";

const KERNEL_MODEL_PATH = new URL("../L00-model/kernel.model.yaml", import.meta.url).pathname;
const TODO_PROJECTION = {
  projector: "todo-projection",
  version: "1.0.0",
  session: { scope: "todo" },
  bindsModel: "todo@1.0.0",
  pages: {
    index: {
      children: [
        {
          for: "$bind.instances",
          template: { component: "Text", props: { text: "$item.title" } },
        },
      ],
    },
  },
};

const UI_CONTEXT_PROJECTION = {
  projector: "ui-context-projection",
  version: "1.0.0",
  session: { scope: "ui-context" },
  bindsModel: "",
  pages: {
    index: {
      children: [
        {
          component: "Context",
          props: { scope: "page", initial: { activeTab: "overview" } },
          children: [
            { component: "Text", props: { text: "$ctx.activeTab" } },
            { component: "Text", props: { text: "$ui.page.activeTab" } },
          ],
        },
      ],
    },
  },
};

describe("auto-bind instances", () => {
  test("meta kernel auto-exposes $bind.instances from app.listInstances", async () => {
    const app = bootTodoModel();
    app.setState("a", { id: "a", title: "first", completed: false });
    app.setState("b", { id: "b", title: "second", completed: true });
    const projector = await createMetaProjectionKernel(app, { yamlPath: KERNEL_MODEL_PATH });
    projector.loadDocument(TODO_PROJECTION as never);
    const html = projector.renderShell({ pageName: "index" });
    expect(html).toContain("first");
    expect(html).toContain("second");
  });

  test("imperative kernel auto-exposes $bind.instances from app.listInstances", () => {
    const app = bootTodoModel();
    app.setState("a", { id: "a", title: "first", completed: false });
    app.setState("b", { id: "b", title: "second", completed: true });
    const projector = new ProjectionKernel(app);
    projector.loadDocument(TODO_PROJECTION as never);
    const html = projector.renderShell({ pageName: "index" });
    expect(html).toContain("first");
    expect(html).toContain("second");
  });

  test("setUiContext updates $ctx and $ui bindings in the meta kernel", async () => {
    const projector = await createMetaProjectionKernel(null, { yamlPath: KERNEL_MODEL_PATH });
    projector.loadDocument(UI_CONTEXT_PROJECTION as never);
    expect(projector.renderShell({ pageName: "index" })).toContain("overview");
    projector.setUiContext("page", "activeTab", "runtime");
    const html = projector.renderShell({ pageName: "index" });
    expect(html).toContain("runtime");
    expect(html).not.toContain("overview");
  });

  test("setUiContext updates $ctx and $ui bindings in the imperative kernel", () => {
    const projector = new ProjectionKernel(null);
    projector.loadDocument(UI_CONTEXT_PROJECTION as never);
    expect(projector.renderShell({ pageName: "index" })).toContain("overview");
    projector.setUiContext("page", "activeTab", "runtime");
    const html = projector.renderShell({ pageName: "index" });
    expect(html).toContain("runtime");
    expect(html).not.toContain("overview");
  });
});

function bootTodoModel() {
  const kernel = AlgebraicKernel.create();
  const loader = new ModelLoader(kernel);
  loader.setIntentProcessor(new IntentProcessor(kernel));
  return loader.boot({
    model: "todo",
    version: "1.0.0",
    origin: "test",
    lifecycle: {
      states: ["open", "done"],
      initial: "open",
      terminal: ["done"],
      transitions: [{ from: "open", to: "done", verb: "complete" }],
    },
    actions: {
      CompleteTodo: {
        verb: "complete",
        inputSchema: { type: "object" },
      },
    },
  });
}
