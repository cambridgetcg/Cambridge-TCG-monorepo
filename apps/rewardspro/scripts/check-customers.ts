import 'dotenv/config';
import { query, param } from './lib/db.mjs';

(async () => {
  const shop = 'teststore12062025.myshopify.com';

  const rows = await query(
    'SELECT COUNT(*) as count FROM "Customer" WHERE shop = :shop',
    [param('shop', shop)]
  );

  console.log(`Customers in database: ${(rows as any)[0]?.count ?? 0}`);
})();
