#!/usr/bin/env python3
import http.server
import os
os.chdir('/Users/liam/lpcmi-recruitment/docs')
http.server.HTTPServer(('', 8769), http.server.SimpleHTTPRequestHandler).serve_forever()
