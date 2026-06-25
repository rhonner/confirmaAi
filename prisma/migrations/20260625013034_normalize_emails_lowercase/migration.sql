-- Normaliza e-mails existentes para lowercase + trim, alinhando os dados ao
-- novo comportamento (schemas Zod fazem trim().toLowerCase() em login/registro/
-- reenvio/esqueci-senha). Sem isso, uma conta gravada com maiúsculas deixaria
-- de "casar" no login após a normalização do input.
--
-- Collision-safe: só atualiza linhas cujo e-mail normalizado NÃO colide com
-- outra conta — assim nunca viola o índice único `User_email_key`. Bases sem
-- duplicatas case-insensitive (o caso esperado, pré-marketing) são totalmente
-- normalizadas; eventuais colisões ficam intactas para tratamento manual.
UPDATE "User" u
SET "email" = lower(btrim(u."email"))
WHERE u."email" <> lower(btrim(u."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "User" o
    WHERE o."id" <> u."id"
      AND lower(btrim(o."email")) = lower(btrim(u."email"))
  );
