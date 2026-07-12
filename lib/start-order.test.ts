/**
 * Testes da lógica de cascata da ordem de largada.
 * Rodar com: npm run test:start-order  (usa tsx, sem framework)
 */
import assert from "node:assert/strict";
import {
  computeCascade,
  calculateStartTime,
  durationMinutes,
  minutesToTime,
  timeToMinutes,
  type CascadeEntry,
} from "./start-order";

const entry = (partial: Partial<CascadeEntry> & { categoryId: number }): CascadeEntry => ({
  orderPosition: 1,
  numberStart: 1,
  numberEnd: 0,
  startTime: "08:00",
  intervalSeconds: 60,
  timeBetweenCategories: 0,
  registrationCount: 0,
  numberStartManual: false,
  numberEndManual: false,
  startTimeManual: false,
  ...partial,
});

// --- conversões básicas ---
assert.equal(timeToMinutes("08:30"), 510);
assert.equal(minutesToTime(510), "08:30");
assert.equal(minutesToTime(24 * 60 + 5), "00:05", "vira o dia");
assert.equal(durationMinutes(3, 60), 2, "3 pilotos a 60s = 2min");
assert.equal(durationMinutes(5, 90), 6, "5 pilotos a 90s = 360s = 6min");
assert.equal(durationMinutes(1, 60), 0, "1 piloto não tem espera");
assert.equal(calculateStartTime("08:00", 2, 90), "08:03");
assert.equal(calculateStartTime("08:00", 0, 60), "08:00");

// --- cascata básica (cenário do 7º Rally do Cavalo: 3 e 5 inscritos, 60s) ---
{
  const result = computeCascade([
    entry({ categoryId: 1, orderPosition: 1, registrationCount: 3 }),
    entry({ categoryId: 2, orderPosition: 2, registrationCount: 5 }),
    entry({ categoryId: 3, orderPosition: 3, registrationCount: 2 }),
  ]);
  assert.deepEqual(
    result.map(r => [r.numberStart, r.numberEnd, r.startTime]),
    [[1, 3, "08:00"], [4, 8, "08:02"], [9, 10, "08:06"]]
  );
}

// --- numberEnd automático expande quando entra inscrição nova ---
{
  const [a, b] = computeCascade([
    entry({ categoryId: 1, orderPosition: 1, registrationCount: 4, numberEnd: 3 }),
    entry({ categoryId: 2, orderPosition: 2, registrationCount: 1 }),
  ]);
  assert.equal(a.numberEnd, 4, "expande de 3 pra 4 com o inscrito novo");
  assert.equal(b.numberStart, 5, "categoria seguinte acompanha");
}

// --- numberEnd manual é preservado (faixa reservada) ---
{
  const [a, b] = computeCascade([
    entry({ categoryId: 1, orderPosition: 1, registrationCount: 3, numberEnd: 10, numberEndManual: true }),
    entry({ categoryId: 2, orderPosition: 2, registrationCount: 2 }),
  ]);
  assert.equal(a.numberEnd, 10);
  assert.equal(b.numberStart, 11);
  // 10 vagas a 60s = 9min de duração
  assert.equal(b.startTime, "08:09");
}

// --- startTime manual é preservado e vira âncora pras seguintes ---
{
  const [, b, c] = computeCascade([
    entry({ categoryId: 1, orderPosition: 1, registrationCount: 3 }),
    entry({ categoryId: 2, orderPosition: 2, registrationCount: 2, startTime: "10:00", startTimeManual: true }),
    entry({ categoryId: 3, orderPosition: 3, registrationCount: 1 }),
  ]);
  assert.equal(b.startTime, "10:00", "horário manual não é sobrescrito");
  assert.equal(c.startTime, "10:01", "seguinte cascateia a partir do manual");
}

// --- numberStart manual é preservado (buraco proposital na numeração) ---
{
  const [, b, c] = computeCascade([
    entry({ categoryId: 1, orderPosition: 1, registrationCount: 3 }),
    entry({ categoryId: 2, orderPosition: 2, registrationCount: 2, numberStart: 101, numberStartManual: true }),
    entry({ categoryId: 3, orderPosition: 3, registrationCount: 1 }),
  ]);
  assert.equal(b.numberStart, 101);
  assert.equal(b.numberEnd, 102);
  assert.equal(c.numberStart, 103);
}

// --- timeBetweenCategories soma no horário da seguinte ---
{
  const [, b] = computeCascade([
    entry({ categoryId: 1, orderPosition: 1, registrationCount: 3, timeBetweenCategories: 5 }),
    entry({ categoryId: 2, orderPosition: 2, registrationCount: 1 }),
  ]);
  assert.equal(b.startTime, "08:07", "2min de duração + 5min de gap");
}

// --- categoria sem inscritos ocupa 1 vaga (não zera a cascata) ---
{
  const [a, b] = computeCascade([
    entry({ categoryId: 1, orderPosition: 1, registrationCount: 0 }),
    entry({ categoryId: 2, orderPosition: 2, registrationCount: 2 }),
  ]);
  assert.equal(a.numberEnd, 1);
  assert.equal(b.numberStart, 2);
}

// --- ordena por orderPosition e normaliza 1..n (empate desempata por id) ---
{
  const result = computeCascade([
    entry({ categoryId: 9, orderPosition: 7, registrationCount: 1 }),
    entry({ categoryId: 3, orderPosition: 2, registrationCount: 1 }),
    entry({ categoryId: 5, orderPosition: 2, registrationCount: 1 }),
  ]);
  assert.deepEqual(result.map(r => [r.categoryId, r.orderPosition]), [[3, 1], [5, 2], [9, 3]]);
}

// --- numberEnd manual menor que numberStart não quebra (clampa) ---
{
  const [a] = computeCascade([
    entry({ categoryId: 1, orderPosition: 1, numberStart: 10, numberEnd: 5, numberEndManual: true, registrationCount: 3 }),
  ]);
  assert.ok(a.numberEnd >= a.numberStart);
}

console.log("OK — todos os testes de lib/start-order passaram");
