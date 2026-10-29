-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'moving',
    "emirate" TEXT NOT NULL,
    "emiratesServed" JSONB NOT NULL DEFAULT '[]',
    "areas" JSONB NOT NULL,
    "services" JSONB NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "website" TEXT,
    "brandColors" JSONB,
    "brandSpecs" JSONB,
    "tone" TEXT,
    "notes" TEXT,
    "facebookUrl" TEXT NOT NULL DEFAULT '',
    "instagramUrl" TEXT NOT NULL DEFAULT '',
    "driveLink" TEXT NOT NULL DEFAULT '',
    "otherLinks" JSONB NOT NULL DEFAULT '[]',
    "apiCredentials" JSONB,
    "clientNotes" TEXT NOT NULL DEFAULT '[]',
    "companyProfile" TEXT NOT NULL DEFAULT '',
    "onboardingChecklist" TEXT NOT NULL DEFAULT '[]',
    "placeId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedContent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "language" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentAr" TEXT,
    "metadata" JSONB,
    "humanized" BOOLEAN NOT NULL DEFAULT false,
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "fewShotExamples" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GBPPost" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "textAr" TEXT NOT NULL,
    "textEn" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'both',
    "postType" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "keywords" JSONB,
    "imagePrompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "gbpPostId" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GBPPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "scores" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "log" TEXT NOT NULL DEFAULT '[]',
    "keywordChecks" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "replyStatus" TEXT NOT NULL DEFAULT 'none',
    "replyDraft" TEXT NOT NULL DEFAULT '',
    "repliedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GBPConnection" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "googleAccountId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "locationName" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiry" TIMESTAMP(3) NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT true,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GBPConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeywordGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT,
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeywordGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactWhatsapp" TEXT NOT NULL DEFAULT '',
    "companyDescription" TEXT NOT NULL DEFAULT '',
    "websiteUrl" TEXT NOT NULL DEFAULT '',
    "emirate" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'moving',
    "pages" TEXT NOT NULL DEFAULT '[]',
    "servicePageCount" INTEGER NOT NULL DEFAULT 0,
    "locationPageCount" INTEGER NOT NULL DEFAULT 0,
    "corePages" TEXT NOT NULL DEFAULT '[]',
    "projectFocus" TEXT NOT NULL DEFAULT 'seo',
    "secondaryServices" TEXT NOT NULL DEFAULT '[]',
    "websiteCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seoCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adsCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "socialCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherCosts" TEXT NOT NULL DEFAULT '[]',
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seoMonths" INTEGER NOT NULL DEFAULT 0,
    "adsMonths" INTEGER NOT NULL DEFAULT 0,
    "adsIncluded" BOOLEAN NOT NULL DEFAULT false,
    "paymentTerms" TEXT NOT NULL DEFAULT '',
    "deliveryWeeks" INTEGER NOT NULL DEFAULT 4,
    "proposal" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CompetitorPage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitationSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "submitUrl" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT NOT NULL DEFAULT 'nap_citation',
    "category" TEXT NOT NULL DEFAULT 'general',
    "domainAuthority" INTEGER NOT NULL DEFAULT 0,
    "relevantFor" TEXT NOT NULL DEFAULT '["all"]',
    "napFields" TEXT NOT NULL DEFAULT '[]',
    "isFree" BOOLEAN NOT NULL DEFAULT true,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "tier" INTEGER NOT NULL DEFAULT 4,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CitationSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCitation" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "citationSourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unchecked',
    "nameMatch" BOOLEAN NOT NULL DEFAULT false,
    "addressMatch" BOOLEAN NOT NULL DEFAULT false,
    "phoneMatch" BOOLEAN NOT NULL DEFAULT false,
    "websiteMatch" BOOLEAN NOT NULL DEFAULT false,
    "listingUrl" TEXT NOT NULL DEFAULT '',
    "linkUrl" TEXT NOT NULL DEFAULT '',
    "linkStatus" TEXT NOT NULL DEFAULT '',
    "linkCreatedAt" TIMESTAMP(3),
    "issues" TEXT NOT NULL DEFAULT '[]',
    "actionDoneAt" TIMESTAMP(3),
    "lastChecked" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitationCompetitor" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CitationCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "securityQuestion" TEXT NOT NULL DEFAULT '',
    "securityAnswer" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_slug_key" ON "Client"("slug");

-- CreateIndex
CREATE INDEX "GeneratedContent_clientId_createdAt_idx" ON "GeneratedContent"("clientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_name_key" ON "PromptTemplate"("name");

-- CreateIndex
CREATE INDEX "GBPPost_clientId_scheduledDate_idx" ON "GBPPost"("clientId", "scheduledDate");

-- CreateIndex
CREATE INDEX "Audit_clientId_createdAt_idx" ON "Audit"("clientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_reviewId_key" ON "Review"("reviewId");

-- CreateIndex
CREATE INDEX "Review_clientId_publishedAt_idx" ON "Review"("clientId", "publishedAt");

-- CreateIndex
CREATE INDEX "Review_replyStatus_rating_idx" ON "Review"("replyStatus", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "GBPConnection_clientId_key" ON "GBPConnection"("clientId");

-- CreateIndex
CREATE INDEX "KeywordGroup_clientId_idx" ON "KeywordGroup"("clientId");

-- CreateIndex
CREATE INDEX "Project_status_createdAt_idx" ON "Project"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorPage_url_key" ON "CompetitorPage"("url");

-- CreateIndex
CREATE UNIQUE INDEX "CitationSource_name_key" ON "CitationSource"("name");

-- CreateIndex
CREATE INDEX "ClientCitation_clientId_idx" ON "ClientCitation"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCitation_clientId_citationSourceId_key" ON "ClientCitation"("clientId", "citationSourceId");

-- CreateIndex
CREATE INDEX "CitationCompetitor_clientId_idx" ON "CitationCompetitor"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "SessionLog_userId_createdAt_idx" ON "SessionLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SessionLog_createdAt_idx" ON "SessionLog"("createdAt");

-- AddForeignKey
ALTER TABLE "GeneratedContent" ADD CONSTRAINT "GeneratedContent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GBPPost" ADD CONSTRAINT "GBPPost_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCitation" ADD CONSTRAINT "ClientCitation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCitation" ADD CONSTRAINT "ClientCitation_citationSourceId_fkey" FOREIGN KEY ("citationSourceId") REFERENCES "CitationSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitationCompetitor" ADD CONSTRAINT "CitationCompetitor_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
