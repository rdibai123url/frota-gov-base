import { assertSafeOutboundUrl, isPrivateAddress } from "../src/lib/safe-fetch.server.ts";
const cases: [string, boolean][] = [
  ["https://example.com/hook", true],
  ["http://example.com/hook", false],
  ["https://localhost/x", false],
  ["https://127.0.0.1/x", false],
  ["https://10.0.0.5/x", false],
  ["https://192.168.1.10/x", false],
  ["https://172.16.0.1/x", false],
  ["https://169.254.169.254/latest/meta-data", false],
  ["https://[::1]/x", false],
  ["https://[::ffff:127.0.0.1]/x", false],
  ["https://[fd00::1]/x", false],
  ["https://user:pw@example.com/x", false],
  ["ftp://example.com/x", false],
  ["nao-e-url", false],
  ["https://8.8.8.8/x", true],
];
let bad = 0;
for (const [u, expectOk] of cases) {
  let ok = true;
  try {
    await assertSafeOutboundUrl(u);
  } catch {
    ok = false;
  }
  if (ok !== expectOk) {
    bad++;
    console.log("FALHOU:", u, "esperado", expectOk, "obteve", ok);
  }
}
console.log(`${cases.length - bad}/${cases.length} casos corretos`);
console.log("100.64.0.1 privado?", isPrivateAddress("100.64.0.1"));
