-- CreateTable
CREATE TABLE "DashboardModule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DashboardModule_userId_moduleKey_key" ON "DashboardModule"("userId", "moduleKey");

-- CreateIndex
CREATE INDEX "DashboardModule_userId_idx" ON "DashboardModule"("userId");

-- AddForeignKey
ALTER TABLE "DashboardModule" ADD CONSTRAINT "DashboardModule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
