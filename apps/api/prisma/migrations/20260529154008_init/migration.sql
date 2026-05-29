/*
  Warnings:

  - You are about to drop the column `embedding` on the `document_chunks` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "document_chunks_embedding_idx";

-- AlterTable
ALTER TABLE "document_chunks" DROP COLUMN "embedding";
