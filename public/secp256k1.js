<!doctype html>
<html>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width'>
<link rel='icon' type='image/png' href='/favicon.ico'>
<title>packd | server error</title>
<style>
		body {
			font-family: arial;
		}

		h1 {
			font-size: 2em;
			text-transform: uppercase;
			text-shadow: 2px 2px white, -2px -2px white, -2px 2px white, 2px -2px white;
		}

		h1:first-letter {
			border: 0.1em solid black;
			padding: 0em 0.15em;
			margin-right: -0.3em;
		}

		a {
			color: black;
		}

		code {
			color: rgb(200,0,0);
			background: rgba(200,0,0,0.05);
			padding: 0.5em 1em;
			display: block;
		}
	</style>
</head>
<body>
<h1>packd</h1>
<h2>server error</h2>
<p>Please <a href='https://github.com/Rich-Harris/packd/issues'>raise an issue</a>, quoting this URL.</p>
<code>Command failed: npm_config_cache=/tmp /app/node_modules/.bin/npm install --production
gyp ERR! build error
gyp ERR! stack Error: not found: make
gyp ERR! stack at getNotFoundError (/app/node_modules/npm/node_modules/which/which.js:13:12)
gyp ERR! stack at F (/app/node_modules/npm/node_modules/which/which.js:68:19)
gyp ERR! stack at E (/app/node_modules/npm/node_modules/which/which.js:80:29)
gyp ERR! stack at /app/node_modules/npm/node_modules/which/which.js:89:16
gyp ERR! stack at /app/node_modules/npm/node_modules/isexe/index.js:42:5
gyp ERR! stack at /app/node_modules/npm/node_modules/isexe/mode.js:8:5
gyp ERR! stack at FSReqWrap.oncomplete (fs.js:154:21)
gyp ERR! System Linux 4.19.98-0-virt
gyp ERR! command "/usr/bin/node" "/app/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js" "rebuild"
gyp ERR! cwd /tmp/22a91e7817a59ef6cf50ac608afa6587816ac6fa/package
gyp ERR! node -v v10.14.2
gyp ERR! node-gyp -v v5.0.3
gyp ERR! not ok
npm ERR! code ELIFECYCLE
npm ERR! errno 1
npm ERR! <a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="daa9bfb9aae8efecb1eb9aeef4eaf4e9">[email&#160;protected]</a> install: `node-gyp rebuild`
npm ERR! Exit status 1
npm ERR!
npm ERR! Failed at the <a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="57243234276562613c66176379677964">[email&#160;protected]</a> install script.
npm ERR! This is probably not a problem with npm. There is likely additional logging output above.
npm ERR! A complete log of this run can be found in:
npm ERR! /tmp/_logs/2022-01-15T03_50_52_191Z-debug.log
</code>
<script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script></body>
</html>