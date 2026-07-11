-- AlterTable: novos defaults SEM a instrução de resposta (agora anexada no
-- envio por message-template.ts → withResponseInstruction).
ALTER TABLE "Settings" ALTER COLUMN "confirmationMessage" SET DEFAULT 'Olá {nome}, sua consulta na {clinica} está agendada para {data} às {hora}.',
ALTER COLUMN "reminderMessage" SET DEFAULT 'Oi {nome}, ainda não recebemos sua confirmação para a consulta de {data} às {hora} na {clinica}.';

-- Data cleanup (uma vez): remove a instrução de resposta embutida dos templates
-- já existentes, para não duplicar/contradizer a linha canônica anexada no
-- envio. O padrão espelha stripResponseInstruction() em message-template.ts:
-- verbo (responda/responder/digite/envie/mande) + <token> para CONFIRMAR +
-- conector (ou/e/,) + <token> para CANCELAR, tolerante a números errados. Não
-- é ganancioso após "cancelar" (\y) para não engolir o resto da frase quando a
-- instrução está no meio do texto. Depois colapsa espaços duplos e faz trim.
UPDATE "Settings" SET
  "confirmationMessage" = btrim(
    regexp_replace(
      regexp_replace(
        "confirmationMessage",
        '\s*(responda|responder|digite|envie|mande)\s+\S+\s+para\s+confirmar\s+(ou|e|,)\s+\S+\s+para\s+cancelar\y\.?',
        '', 'gi'),
      '[ \t]{2,}', ' ', 'g')
  ),
  "reminderMessage" = btrim(
    regexp_replace(
      regexp_replace(
        "reminderMessage",
        '\s*(responda|responder|digite|envie|mande)\s+\S+\s+para\s+confirmar\s+(ou|e|,)\s+\S+\s+para\s+cancelar\y\.?',
        '', 'gi'),
      '[ \t]{2,}', ' ', 'g')
  );
