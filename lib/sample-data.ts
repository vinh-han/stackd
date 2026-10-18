import { Rating, type Grade } from "ts-fsrs";
import { replayHistory } from "./scheduler";
import type { Deck, StudyCard } from "./types";

// Placeholder decks until Supabase is wired up.

const { Again: A, Hard: H, Good: G, Easy: E } = Rating;
const DAY = 24 * 60 * 60 * 1000;

type Seed = Omit<StudyCard, "id" | "deckId" | "srs" | "createdAt"> &{ history: Grade[]; dueInDays: number };

const SEEDS: Record<string, Seed[]> = {
  aws: [
    {
      type: "scenario", topic: "Storage", subtopic: "S3",
      front: "A company needs to store 50TB of infrequently accessed data with retrieval times under 5 minutes. Which S3 storage class?",
      back: "S3 Glacier Flexible Retrieval. Expedited retrieval returns data in 1 to 5 minutes.",
      sourceRef: "storage-classes.pdf p.12", history: [A, G, G], dueInDays: -0.2,
    },
    {
      type: "scenario", topic: "Networking", subtopic: "VPC",
      front: "An EC2 instance in a private subnet must download patches from the internet without being reachable from it. What do you add?",
      back: "A NAT gateway in a public subnet, plus a route to it from the private subnet's route table. Inbound connections from the internet stay blocked.",
      sourceRef: "vpc-notes.md", history: [H, G], dueInDays: -0.1,
    },
    {
      type: "qa", topic: "Storage", subtopic: "EBS",
      front: "Which EBS volume type gives the highest IOPS for a latency-sensitive database?",
      back: "io2 Block Express. Up to 256,000 IOPS per volume with sub-millisecond latency.",
      sourceRef: "storage-classes.pdf p.31", history: [G, H, G], dueInDays: -1,
    },
    {
      type: "scenario", topic: "Storage", subtopic: "S3",
      front: "Objects must be retained for 7 years for compliance, and no one, including the root user, may delete them early. What do you configure?",
      back: "S3 Object Lock in compliance mode with a 7-year retention period, on a bucket with versioning enabled. Governance mode is not enough: anyone with s3:BypassGovernanceRetention can still delete objects early. A bucket policy that denies deletes can be removed by an admin. Glacier Vault Lock applies to Glacier vaults, not S3 buckets. MFA Delete protects versions but enforces no retention period.",
      sourceRef: "storage-classes.pdf p.18", history: [A, G, G], dueInDays: -0.05,
    },
    {
      type: "definition", topic: "Security", subtopic: "IAM",
      front: "IAM role",
      back: "An identity with permissions but no long-term credentials. Users and services assume it to get temporary credentials from STS.",
      sourceRef: "iam-basics.pdf p.4", history: [G, G], dueInDays: -0.5,
    },
    {
      type: "qa", topic: "Networking", subtopic: "Route 53",
      front: "Which Route 53 routing policy sends users to the Region with the lowest latency?",
      back: "Latency-based routing.",
      sourceRef: "vpc-notes.md", history: [A, G], dueInDays: -0.3,
    },
    {
      type: "cloze", topic: "Security", subtopic: "KMS",
      front: "With automatic rotation enabled, a KMS customer managed key rotates every ___ by default.",
      back: "365 days. The period is configurable from 90 to 2,560 days.",
      sourceRef: "iam-basics.pdf p.22", history: [G, E], dueInDays: -0.8,
    },
    {
      type: "qa", topic: "Networking", subtopic: "ELB",
      front: "Which load balancer supports static IP addresses and handles millions of requests per second at layer 4?",
      back: "Network Load Balancer.",
      sourceRef: "vpc-notes.md", history: [G], dueInDays: -0.15,
    },
    {
      type: "qa", topic: "Security", subtopic: "Shield",
      front: "What does AWS Shield Advanced add over Shield Standard?",
      back: "24/7 access to the Shield Response Team, cost protection for scaling during an attack, and layer 7 attack detection together with AWS WAF.",
      sourceRef: "iam-basics.pdf p.40", history: [G, G], dueInDays: 1.4,
    },
    {
      type: "qa", topic: "Storage", subtopic: "EFS",
      front: "Which service gives many Linux EC2 instances across AZs one shared POSIX file system?",
      back: "Amazon EFS.",
      sourceRef: "storage-classes.pdf p.44", history: [G, H], dueInDays: 2.5,
    },
  ],
  vi: [
    {
      type: "vocab", topic: "Động từ",
      front: "duy trì",
      back: "to maintain, to sustain. Ví dụ: duy trì thói quen học mỗi ngày.",
      sourceRef: "bai-doc-3.txt", history: [G], dueInDays: -0.2,
    },
    {
      type: "vocab", topic: "Tính từ",
      front: "kiên nhẫn",
      back: "patient; patience. Ví dụ: Học ngoại ngữ cần rất nhiều kiên nhẫn.",
      sourceRef: "bai-doc-3.txt", history: [H, G], dueInDays: -0.4,
    },
    {
      type: "vocab", topic: "Trạng từ",
      front: "thường xuyên",
      back: "regularly, frequently. Ví dụ: Tôi thường xuyên ôn tập từ vựng vào buổi sáng.",
      sourceRef: "bai-doc-2.txt", history: [A, G, G], dueInDays: -0.1,
    },
    {
      type: "vocab", topic: "Động từ",
      front: "nghỉ ngơi",
      back: "to rest. Ví dụ: Cuối tuần tôi muốn nghỉ ngơi ở nhà.",
      sourceRef: "bai-doc-2.txt", history: [A, G], dueInDays: -0.6,
    },
    {
      type: "vocab", topic: "Động từ",
      front: "giải thích",
      back: "to explain. Ví dụ: Cô giáo giải thích ngữ pháp rất rõ ràng.",
      sourceRef: "bai-doc-1.txt", history: [G, E], dueInDays: 3,
    },
  ],
  pharm: [
    {
      type: "qa", topic: "Endocrine",
      front: "Mechanism of action of metformin?",
      back: "Decreases hepatic gluconeogenesis, largely via AMPK activation, and improves peripheral insulin sensitivity.",
      sourceRef: "lecture-07.pdf p.3", history: [G, H, G], dueInDays: 2,
    },
    {
      type: "qa", topic: "Hematology",
      front: "Reversal agent for warfarin?",
      back: "Vitamin K (phytonadione). For rapid reversal, prothrombin complex concentrate.",
      sourceRef: "lecture-09.pdf p.11", history: [G, G], dueInDays: 4,
    },
    {
      type: "definition", topic: "Cardiovascular",
      front: "-olol",
      back: "Suffix for beta blockers, e.g. metoprolol, propranolol.",
      sourceRef: "lecture-04.pdf p.2", history: [G, E], dueInDays: 6,
    },
  ],
};

/** Sample decks for trying the app without generating anything. Ids are fresh, so loading twice is safe. */
export function createSampleData(now: Date): { decks: Deck[]; cards: StudyCard[] } {
  const ids = { aws: crypto.randomUUID(), vi: crypto.randomUUID(), pharm: crypto.randomUUID() };
  const decks: Deck[] = [
    { id: ids.aws, name: "AWS SAA-C03", accentHue: 190, examDate: new Date(now.getTime() + 23 * DAY), createdAt: now },
    { id: ids.vi, name: "Tiếng Việt B1", accentHue: 300, lang: "vi", createdAt: now },
    { id: ids.pharm, name: "Pharmacology", accentHue: 25, createdAt: now },
  ];
  const cards = Object.entries(SEEDS).flatMap(([key, seeds]) =>
    seeds.map(({ history, dueInDays, ...rest }) => ({
      ...rest,
      id: crypto.randomUUID(),
      deckId: ids[key as keyof typeof ids],
      srs: replayHistory(history, now, dueInDays),
      createdAt: now,
    })),
  );
  return { decks, cards };
}
