import pexpect
import sys

child = pexpect.spawn('pnpm run migrate:gen', encoding='utf-8')
child.logfile = sys.stdout

while True:
    index = child.expect(['Is .* created or renamed from another table\?', '.*rename.*', pexpect.EOF, pexpect.TIMEOUT], timeout=5)
    if index == 0 or index == 1:
        child.send('\r')
    elif index == 2:
        break
    elif index == 3:
        child.send('\r')
