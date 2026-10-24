// Processo gravador usado pelo teste de escrita concorrente (TE-009, decisão 1): acrescenta
// registros de lock em events.jsonl pela mesma função de telemetria que o runner usa.
import { recordLockEvent } from '../../../harness/telemetry.mjs';

const { HARNESS_ROOT, HARNESS_CHANGE, WRITER_TAG, WRITES, PAYLOAD_BYTES } = process.env;
const payload = 'x'.repeat(Number(PAYLOAD_BYTES));

for (let index = 0; index < Number(WRITES); index += 1) {
  recordLockEvent(HARNESS_ROOT, HARNESS_CHANGE, {
    event: 'acquired', lock_id: `${WRITER_TAG}-${index}`, execution_id: WRITER_TAG, writer: WRITER_TAG, payload,
  });
}
