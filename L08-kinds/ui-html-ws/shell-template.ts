const DEFAULT_SHELL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>{{title}}</title>
<link rel="stylesheet" href="/assets/theme.css" />
</head>
<body>
<div id="root">{{body}}</div>
<script>{{handlersJs}}</script>
<script type="module">
import init from "/runtime.js";
init();
</script>
</body>
</html>`;

export default DEFAULT_SHELL_HTML;
