export interface PrimitiveDef {
  name: string;
  supportsChildren: boolean;
  interactive?: boolean;
  validateProps?: (props: Record<string, unknown>) => string | null;
}

export class PrimitiveRegistry {
  private prims = new Map<string, PrimitiveDef>();

  register(prim: PrimitiveDef): void {
    if (this.prims.has(prim.name)) {
      throw new Error(`Primitive already registered: "${prim.name}"`);
    }
    this.prims.set(prim.name, prim);
  }

  has(name: string): boolean {
    return this.prims.has(name);
  }

  resolve(name: string): PrimitiveDef | null {
    return this.prims.get(name) ?? null;
  }

  list(): string[] {
    return [...this.prims.keys()];
  }

  static createWithBuiltins(): PrimitiveRegistry {
    const r = new PrimitiveRegistry();
    const add = (p: PrimitiveDef) => r.register(p);

    add({ name: "Text", supportsChildren: false });
    add({ name: "Heading", supportsChildren: false });
    add({ name: "Badge", supportsChildren: false });
    add({ name: "StatusDot", supportsChildren: false });
    add({ name: "Link", supportsChildren: false, interactive: true });
    add({ name: "Button", supportsChildren: false, interactive: true });
    add({ name: "Input", supportsChildren: false });
    add({ name: "Form", supportsChildren: true, interactive: true });
    add({ name: "Stack", supportsChildren: true });
    add({ name: "Row", supportsChildren: true });
    add({ name: "Column", supportsChildren: true });
    add({ name: "Grid", supportsChildren: true });
    add({ name: "Card", supportsChildren: true });
    add({ name: "Section", supportsChildren: true });
    add({ name: "List", supportsChildren: true });
    add({ name: "Iframe", supportsChildren: false });
    add({ name: "Breadcrumb", supportsChildren: false });
    add({ name: "Context", supportsChildren: true });
    add({ name: "Effect", supportsChildren: false });
    add({ name: "EventTimeline", supportsChildren: false, interactive: true });
    add({ name: "Inspector", supportsChildren: false });
    add({ name: "SearchBox", supportsChildren: false });
    add({ name: "SchemaForm", supportsChildren: false });
    add({ name: "Select", supportsChildren: false, interactive: true });
    add({ name: "Split", supportsChildren: true });
    add({ name: "TabBar", supportsChildren: false, interactive: true });
    add({ name: "Tree", supportsChildren: true });
    add({ name: "Code", supportsChildren: false });
    add({ name: "DescriptionList", supportsChildren: true });
    add({ name: "EditableText", supportsChildren: false, interactive: true });
    add({ name: "EmptyState", supportsChildren: true });
    add({ name: "GridDense", supportsChildren: true });
    add({ name: "Icon", supportsChildren: false });
    add({ name: "KeyValueList", supportsChildren: true });
    add({ name: "Pill", supportsChildren: false });
    add({ name: "StickyHeader", supportsChildren: true });
    add({ name: "StateMachineGraph", supportsChildren: false });
    add({ name: "Table", supportsChildren: true });
    add({ name: "TableCell", supportsChildren: true });
    add({ name: "TableColumn", supportsChildren: false });
    add({ name: "TableRow", supportsChildren: true });
    add({ name: "TabsNested", supportsChildren: false, interactive: true });
    add({ name: "Timeline", supportsChildren: true });
    add({ name: "Toolbar", supportsChildren: true });
    add({ name: "Splitter", supportsChildren: true });

    return r;
  }
}
