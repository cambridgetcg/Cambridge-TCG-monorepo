// URL encode the password for connection string
const password = "gA8YHoh7YJ0|Ze2sBi[[iA[XO$Ce";
const encodedPassword = encodeURIComponent(password);
console.log("Encoded password:", encodedPassword);
console.log("\nFull connection string:");
console.log(`DATABASE_URL=postgresql://postgres:${encodedPassword}@rewardspro-dev.cluster-cj06ko4ko87d.eu-north-1.rds.amazonaws.com:5432/rewardspro`);