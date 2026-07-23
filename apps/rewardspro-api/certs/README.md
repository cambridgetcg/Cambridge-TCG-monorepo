# RDS trust bundle

`eu-west-2-bundle.pem` is the Amazon RDS Europe (London) regional root bundle
used by every production API, worker, and migration task.

- Authoritative source:
  `https://truststore.pki.rds.amazonaws.com/eu-west-2/eu-west-2-bundle.pem`
- Retrieved: 2026-07-23
- SHA-256:
  `17c557502061c4879b844fff983288a2fb07d520f4cf2a5de60f5cda800a4494`
- Contents: the AWS-published ECC384 G1, RSA4096 G1, and RSA2048 G1
  `eu-west-2` RDS root CAs.

The image never downloads trust material at runtime. Before replacing this
file, follow the current Amazon RDS certificate-rotation guidance, verify the
TLS origin, inspect every certificate, record the new digest here, and exercise
the production preflight against the target RDS certificate.
