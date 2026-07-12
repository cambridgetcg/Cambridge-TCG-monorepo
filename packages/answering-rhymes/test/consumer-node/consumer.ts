import { webcrypto } from "node:crypto";
import {
  answeringRhymeStatementContentHash,
  type AnsweringRhymeSha256DigestProvider,
  validateAnsweringRhymeStatement,
} from "@cambridge-tcg/answering-rhymes";

const digestProvider: AnsweringRhymeSha256DigestProvider = webcrypto.subtle;
const validation = validateAnsweringRhymeStatement({});

if (validation.ok) {
  void answeringRhymeStatementContentHash(
    validation.value,
    digestProvider,
  );
}
