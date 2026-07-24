-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'TRANS_WOMAN', 'TRANS_MAN', 'TRAVESTI', 'NON_BINARY', 'AGENDER', 'GENDERFLUID', 'SELF_DESCRIBED', 'NOT_INFORMED');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "birthDate" VARCHAR(10),
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "genderSelfDescribed" VARCHAR(60);
