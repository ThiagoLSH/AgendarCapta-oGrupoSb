// Runner standalone para rodar a sincronização via cron externo (ex: cron do próprio servidor,
// GitHub Actions, ou `railway cron`), sem depender de um endpoint HTTP.
// Uso: npm run sync:once
import "dotenv/config";
import { syncCaptacoesToGoogleCalendar } from "../lib/sync";

async function main() {
  const result = await syncCaptacoesToGoogleCalendar();
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
