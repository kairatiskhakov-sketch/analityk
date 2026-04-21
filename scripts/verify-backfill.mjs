import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
try {
  const org = await p.organization.findUnique({ where: { id: "org_default_0001" } });
  console.log("Default org:", org);
  const members = await p.orgMember.count({ where: { orgId: "org_default_0001" } });
  console.log("OrgMembers in default:", members);

  const stats = {
    crmConnections: await p.crmConnection.count({ where: { orgId: "org_default_0001" } }),
    managers: await p.manager.count({ where: { orgId: "org_default_0001" } }),
    stageConfigs: await p.stageConfig.count({ where: { orgId: "org_default_0001" } }),
    planTargets: await p.planTarget.count({ where: { orgId: "org_default_0001" } }),
    dictionaries: await p.crmDictionary.count({ where: { orgId: "org_default_0001" } }),
    telegram: await p.telegramConnection.count({ where: { orgId: "org_default_0001" } }),
    google: await p.googleConnection.count({ where: { orgId: "org_default_0001" } }),
  };
  console.log("Backfilled into default org:", stats);

  const orphans = {
    crmConnections: await p.crmConnection.count({ where: { orgId: null } }),
    managers: await p.manager.count({ where: { orgId: null } }),
    stageConfigs: await p.stageConfig.count({ where: { orgId: null } }),
  };
  console.log("Orphans (orgId NULL — should be 0):", orphans);
} finally {
  await p.$disconnect();
}
