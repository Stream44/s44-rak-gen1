import type { ProjectionNode, ProjectionTree } from "../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr } from "../L08-kinds/ui-html-ws/backend-helpers.ts";
import emitHandlersJs from "../L08-kinds/ui-html-ws/ws-action.ts";
import renderBadge from "../L08-kinds/ui-html-ws/primitives/Badge.ts";
import renderBreadcrumb from "../L08-kinds/ui-html-ws/primitives/Breadcrumb.ts";
import renderButton from "../L08-kinds/ui-html-ws/primitives/Button.ts";
import renderCard from "../L08-kinds/ui-html-ws/primitives/Card.ts";
import renderColumn from "../L08-kinds/ui-html-ws/primitives/Column.ts";
import renderCode from "../L08-kinds/ui-html-ws/primitives/Code.ts";
import renderDescriptionList from "../L08-kinds/ui-html-ws/primitives/DescriptionList.ts";
import renderEditableText from "../L08-kinds/ui-html-ws/primitives/EditableText.ts";
import renderEmptyState from "../L08-kinds/ui-html-ws/primitives/EmptyState.ts";
import renderEventTimeline from "../L08-kinds/ui-html-ws/primitives/EventTimeline.ts";
import renderForm from "../L08-kinds/ui-html-ws/primitives/Form.ts";
import renderGrid from "../L08-kinds/ui-html-ws/primitives/Grid.ts";
import renderGridDense from "../L08-kinds/ui-html-ws/primitives/GridDense.ts";
import renderHeading from "../L08-kinds/ui-html-ws/primitives/Heading.ts";
import renderIframe from "../L08-kinds/ui-html-ws/primitives/Iframe.ts";
import renderIcon from "../L08-kinds/ui-html-ws/primitives/Icon.ts";
import renderInput from "../L08-kinds/ui-html-ws/primitives/Input.ts";
import renderInspector from "../L08-kinds/ui-html-ws/primitives/Inspector.ts";
import renderKeyValueList from "../L08-kinds/ui-html-ws/primitives/KeyValueList.ts";
import renderLink from "../L08-kinds/ui-html-ws/primitives/Link.ts";
import renderList from "../L08-kinds/ui-html-ws/primitives/List.ts";
import renderPill from "../L08-kinds/ui-html-ws/primitives/Pill.ts";
import renderRow from "../L08-kinds/ui-html-ws/primitives/Row.ts";
import renderSearchBox from "../L08-kinds/ui-html-ws/primitives/SearchBox.ts";
import renderSelect from "../L08-kinds/ui-html-ws/primitives/Select.ts";
import renderSection from "../L08-kinds/ui-html-ws/primitives/Section.ts";
import renderSplit from "../L08-kinds/ui-html-ws/primitives/Split.ts";
import renderSplitter from "../L08-kinds/ui-html-ws/primitives/Splitter.ts";
import renderStack from "../L08-kinds/ui-html-ws/primitives/Stack.ts";
import renderStatusDot from "../L08-kinds/ui-html-ws/primitives/StatusDot.ts";
import renderStickyHeader from "../L08-kinds/ui-html-ws/primitives/StickyHeader.ts";
import renderTabBar from "../L08-kinds/ui-html-ws/primitives/TabBar.ts";
import renderTable from "../L08-kinds/ui-html-ws/primitives/Table.ts";
import renderTableCell from "../L08-kinds/ui-html-ws/primitives/TableCell.ts";
import renderTableRow from "../L08-kinds/ui-html-ws/primitives/TableRow.ts";
import renderTabsNested from "../L08-kinds/ui-html-ws/primitives/TabsNested.ts";
import renderText from "../L08-kinds/ui-html-ws/primitives/Text.ts";
import renderToolbar from "../L08-kinds/ui-html-ws/primitives/Toolbar.ts";
import renderTree from "../L08-kinds/ui-html-ws/primitives/Tree.ts";

export interface HtmlOutput {
  html: string;
  handlersJs: string;
}

type PrimitiveRenderer = (
  node: ProjectionNode,
  ctx: {
    renderChildren: (node: ProjectionNode) => string;
    renderListChildren: (node: ProjectionNode) => string;
  },
) => string;

const renderContext: PrimitiveRenderer = (node, ctx) => ctx.renderChildren(node);

const RENDERERS = new Map<string, PrimitiveRenderer>([
  ["Badge", renderBadge],
  ["Breadcrumb", renderBreadcrumb],
  ["Button", renderButton],
  ["Card", renderCard],
  ["Column", renderColumn],
  ["Code", renderCode],
  ["Context", renderContext],
  ["DescriptionList", renderDescriptionList],
  ["EditableText", renderEditableText],
  ["EmptyState", renderEmptyState],
  ["EventTimeline", renderEventTimeline],
  ["Form", renderForm],
  ["Grid", renderGrid],
  ["GridDense", renderGridDense],
  ["Heading", renderHeading],
  ["Iframe", renderIframe],
  ["Icon", renderIcon],
  ["Input", renderInput],
  ["Inspector", renderInspector],
  ["KeyValueList", renderKeyValueList],
  ["Link", renderLink],
  ["List", renderList],
  ["Pill", renderPill],
  ["Row", renderRow],
  ["SearchBox", renderSearchBox],
  ["Select", renderSelect],
  ["Section", renderSection],
  ["Split", renderSplit],
  ["Splitter", renderSplitter],
  ["Stack", renderStack],
  ["StatusDot", renderStatusDot],
  ["StickyHeader", renderStickyHeader],
  ["TabBar", renderTabBar],
  ["Table", renderTable],
  ["TableCell", renderTableCell],
  ["TableRow", renderTableRow],
  ["TabsNested", renderTabsNested],
  ["Text", renderText],
  ["Toolbar", renderToolbar],
  ["Tree", renderTree],
]);

export function renderHtmlTree(tree: ProjectionTree): HtmlOutput {
  return {
    html: renderNode(tree.root),
    handlersJs: emitHandlersJs(tree),
  };
}

function renderNode(node: ProjectionNode): string {
  if (!node.component) {
    return renderChildren(node);
  }
  const render = RENDERERS.get(node.component);
  if (!render) {
    return `<div data-unknown-primitive="${escapeAttr(node.component)}"${buildAttrs(node)}>${renderChildren(node)}</div>`;
  }
  return render(node, { renderChildren, renderListChildren });
}

function renderChildren(node: ProjectionNode): string {
  return (node.children ?? []).map((child) => renderNode(child)).join("");
}

function renderListChildren(node: ProjectionNode): string {
  // Mirror the child's top-level `class` onto the <li> wrapper so CSS can
  // target list items directly (e.g. `li.completed`, `li.editing`). The
  // class stays on the child as well so selectors that target inner tags
  // (e.g. `.filters li a.selected`) keep matching — cheap redundancy for
  // a big usability win in the projection.
  return (node.children ?? [])
    .map((child) => {
      const cls =
        typeof child.props?.class === "string" ? (child.props.class as string).trim() : "";
      const liAttrs = cls ? ` class="${escapeAttr(cls)}"` : "";
      return `<li${liAttrs}>${renderNode(child)}</li>`;
    })
    .join("");
}
