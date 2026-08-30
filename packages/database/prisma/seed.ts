import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding database with sample data...');

  // Create a sample repository
  const repo = await prisma.repository.upsert({
    where: { fullName: 'sample-org/sample-repo' },
    update: {},
    create: {
      fullName: 'sample-org/sample-repo',
      defaultBranch: 'main',
      language: 'TypeScript',
    },
  });

  console.log(`Repository: ${repo.fullName} (${repo.id})`);
  console.log('Seed complete.');
}

main()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
