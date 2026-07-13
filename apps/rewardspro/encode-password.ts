const password = process.argv[2] ?? process.env.REWARDSPRO_DATABASE_PASSWORD;

if (!password) {
  console.error(
    "Provide a password argument or set REWARDSPRO_DATABASE_PASSWORD.",
  );
  process.exitCode = 1;
} else {
  // Print only the encoded value requested by this utility, never a full DSN.
  console.log(encodeURIComponent(password));
}
