import { createRandom, shuffle } from './random';
import type { Tip } from './tips';

/**
 * The general advice library.
 *
 * `tips.ts` answers "help me with *this* question". This module answers the other half:
 * the standing advice that applies to every question and is worth meeting repeatedly —
 * exam technique, pacing, the qualifiers that decide an answer, and the handful of AWS
 * facts that the four exam domains keep circling back to.
 *
 * It is deliberately larger than anyone reads in one sitting. The ticker shows one item at
 * a time in a seeded order, so a candidate who sits three mocks meets three different
 * openings rather than the same first tip every time.
 *
 * Every factual claim here must be true of AWS today. A confidently wrong tip is worse
 * than no tip, because it is repeated during study and recalled under time pressure.
 */

/** The families of advice the library covers. The first five are exam craft; the last four
 *  mirror the exam's own domains. */
export const TIP_CATEGORIES = [
	'technique',
	'timing',
	'reading',
	'distractors',
	'mindset',
	'secure',
	'resilient',
	'performance',
	'cost'
] as const;

export type TipCategory = (typeof TIP_CATEGORIES)[number];

/** A library tip is a `Tip` that also knows which family it belongs to. */
export interface LibraryTip extends Tip {
	readonly category: TipCategory;
}

/**
 * The longest body the ticker can show without wrapping past two lines on a narrow screen.
 *
 * Enforced by the spec rather than by trimming at runtime, so an over-long tip is caught
 * when it is written instead of being silently cut off in front of a candidate.
 */
export const TIP_BODY_MAX_LENGTH = 200;

/** The whole library, in the order it was written. Callers get a shuffled copy instead. */
const LIBRARY: readonly LibraryTip[] = [
	{
		category: 'technique',
		label: 'Read the last line first',
		body:
			'The closing sentence names what is actually being asked. Read it before the scenario ' +
			'and you spend the scenario hunting for one thing instead of memorising all of it.'
	},
	{
		category: 'technique',
		label: 'Find the deciding constraint',
		body:
			'Most scenarios hide one hard limit: a budget, a latency figure, a recovery objective, ' +
			'a compliance rule. The option that honours it wins and the rest are decoration.'
	},
	{
		category: 'technique',
		label: 'Eliminate before you select',
		body:
			'Strike the two weakest options first. What is left is a straight comparison, and ' +
			'usually one of the two quietly ignores something the scenario stated.'
	},
	{
		category: 'technique',
		label: 'Answer before you read the options',
		body:
			'Decide what you would build, then look. Arriving with an answer of your own makes a ' +
			'well-written distractor far harder to talk you into.'
	},
	{
		category: 'technique',
		label: 'Count the answers demanded',
		body:
			'Choose TWO scores nothing if you select one or three. Check the required count, then ' +
			'judge each option as its own true-or-false statement.'
	},
	{
		category: 'technique',
		label: 'Managed beats hand-built',
		body:
			'When two options do the same job, the one leaning on a managed service usually wins — ' +
			'unless the question explicitly asks for control over the underlying instances.'
	},
	{
		category: 'timing',
		label: 'Two minutes a question',
		body:
			'65 questions in 130 minutes is exactly two minutes each. Anything past three minutes ' +
			'is borrowed from a question you have not seen yet.'
	},
	{
		category: 'timing',
		label: 'Checkpoint at the halfway mark',
		body:
			'By question 33 the clock should read about 65 minutes. If you are behind there, speed ' +
			'up immediately rather than hoping to make it back at the end.'
	},
	{
		category: 'timing',
		label: 'Flag and move on',
		body:
			'If nothing has clicked in ninety seconds, choose the best option you have, flag it, and ' +
			'move. A flagged guess is worth more than an unfinished paper.'
	},
	{
		category: 'timing',
		label: 'Bank time on the short ones',
		body:
			'Some questions are one line long and obvious. Answer them in twenty seconds and put the ' +
			'surplus into the five-paragraph scenarios that actually need it.'
	},
	{
		category: 'timing',
		label: 'Reserve the last ten minutes',
		body:
			'Keep the final ten minutes for flagged questions and for confirming nothing was left ' +
			'blank. Rushing the last few items loses more marks than the hurry saves.'
	},
	{
		category: 'reading',
		label: 'MOST cost-effective',
		body:
			'Several options will work. Only one is the cheapest that still meets every stated ' +
			'requirement — a cheaper option that breaks a requirement is simply wrong.'
	},
	{
		category: 'reading',
		label: 'LEAST operational overhead',
		body:
			'This is a vote for managed and serverless. Anything you have to patch, scale or babysit ' +
			'loses to a service that does those things for you.'
	},
	{
		category: 'reading',
		label: 'MUST is not SHOULD',
		body:
			'A MUST is a gate, not a preference. Any option failing it is eliminated outright, ' +
			'however elegant the rest of that option looks.'
	},
	{
		category: 'reading',
		label: 'Without downtime',
		body:
			'That phrase rules out anything needing a stop, a restart, a cutover window or a data ' +
			'reload. Look for rolling, blue-green, or genuinely online changes.'
	},
	{
		category: 'reading',
		label: 'Existing versus greenfield',
		body:
			'If the application already runs and cannot be rewritten, an option that rebuilds it as ' +
			'serverless is wrong no matter how modern it sounds.'
	},
	{
		category: 'reading',
		label: 'Numbers are requirements',
		body:
			'A stated recovery point of 15 minutes, a 100 ms latency budget or a 10 TB dataset exists ' +
			'to disqualify options. Check every figure before you choose.'
	},
	{
		category: 'distractors',
		label: 'True but irrelevant',
		body:
			'A statement can be perfectly accurate about AWS and still not answer the question asked. ' +
			'Correctness is not relevance, and this is the most common trap.'
	},
	{
		category: 'distractors',
		label: 'Right service, wrong feature',
		body:
			'The service name reassures you, then the option attaches a capability that service does ' +
			'not have. Read the whole option, not the first two words.'
	},
	{
		category: 'distractors',
		label: 'Valid but inferior',
		body:
			'Two options may both work. The qualifier in the question — cheapest, fastest, least ' +
			'overhead — is what decides which of the two is being asked for.'
	},
	{
		category: 'distractors',
		label: 'Absolutes deserve suspicion',
		body:
			'Real architectures trade one thing for another. An option promising something with no ' +
			'cost, no limit and no downside is usually the written-in distractor.'
	},
	{
		category: 'distractors',
		label: 'Over-engineering is still wrong',
		body:
			'Multi-Region active-active for an internal reporting tool works, and is still the wrong ' +
			'answer. Match the size of the solution to the stakes described.'
	},
	{
		category: 'mindset',
		label: 'A blank scores zero',
		body:
			'There is no penalty for a wrong answer, so an unanswered question is a guaranteed loss. ' +
			'Never leave one empty, whatever the clock says.'
	},
	{
		category: 'mindset',
		label: 'Guess with structure',
		body:
			'Even a rushed guess improves if you strike one clearly wrong option first. One in three ' +
			'beats one in four, and it costs you five seconds.'
	},
	{
		category: 'mindset',
		label: 'Do not revisit without a reason',
		body:
			'Change an answer only for a reason you can name — a constraint you missed, a word you ' +
			'misread. Vague unease is not a reason and is usually wrong.'
	},
	{
		category: 'mindset',
		label: 'One question at a time',
		body:
			'A hard question already behind you cannot cost you anything more. Dwelling on it costs ' +
			'you the question actually on screen.'
	},
	{
		category: 'mindset',
		label: 'Some questions do not count',
		body:
			'Fifteen of the 65 items are unscored and never identified. A question that feels ' +
			'unfairly obscure may simply be one of them, so let it go.'
	},
	{
		category: 'secure',
		label: 'Security groups are stateful',
		body:
			'Return traffic for an allowed inbound flow is permitted automatically. Network ACLs are ' +
			'stateless, so they need an explicit rule in each direction.'
	},
	{
		category: 'secure',
		label: 'Only NACLs can deny',
		body:
			'Security groups hold allow rules only. Network ACLs are evaluated in rule-number order ' +
			'and are the place to block a specific address range.'
	},
	{
		category: 'secure',
		label: 'Roles, never long-lived keys',
		body:
			'Access keys stored on an instance or in code are the wrong answer. Attach an IAM role ' +
			'and the credentials become temporary and rotated for you.'
	},
	{
		category: 'secure',
		label: 'Explicit deny always wins',
		body:
			'Nothing grants back what an explicit deny removes. Service control policies work the ' +
			'same way: they cap what an account may do, they never grant it.'
	},
	{
		category: 'secure',
		label: 'CloudTrail is who, CloudWatch is what',
		body:
			'API calls and their callers are recorded by CloudTrail. Metrics and application logs ' +
			'live in CloudWatch. An audit question wants the former.'
	},
	{
		category: 'secure',
		label: 'Session Manager over bastions',
		body:
			'Shell access with no inbound SSH port and no bastion host is normally the intended ' +
			'answer when the question asks for least exposure or least overhead.'
	},
	{
		category: 'resilient',
		label: 'Multi-AZ is availability',
		body:
			'A Multi-AZ standby exists to fail over automatically. In the classic RDS deployment it ' +
			'serves no reads, so it never answers a read-scaling question.'
	},
	{
		category: 'resilient',
		label: 'Read replicas are scale',
		body:
			'Replicas take read load off the primary and lag asynchronously. They add throughput, ' +
			'not automatic failover, unless you promote one by hand.'
	},
	{
		category: 'resilient',
		label: 'Spread across zones first',
		body:
			'Before reaching for a second Region, check the answer is not simply an Auto Scaling ' +
			'group behind a load balancer, spanning two or more Availability Zones.'
	},
	{
		category: 'resilient',
		label: 'NAT gateways are zonal',
		body:
			'A NAT gateway lives in one Availability Zone. Surviving the loss of that zone means one ' +
			'gateway per zone, with each subnet routing to its own.'
	},
	{
		category: 'resilient',
		label: 'RTO and RPO pick the pattern',
		body:
			'Backup and restore is cheapest and slowest. Pilot light, warm standby and active-active ' +
			'each cut recovery time and each raise the bill.'
	},
	{
		category: 'resilient',
		label: 'Health checks decide replacement',
		body:
			'An Auto Scaling group replaces only what it knows is unhealthy. Using the load ' +
			"balancer's health check catches an instance that is running but broken."
	},
	{
		category: 'resilient',
		label: 'Stateless tiers survive',
		body:
			'Sticky sessions keep a user pinned to one server. Moving session state to DynamoDB or ' +
			'ElastiCache lets any instance be replaced without anyone noticing.'
	},
	{
		category: 'performance',
		label: 'gp3 stops at 16,000 IOPS',
		body:
			'One gp3 volume can be provisioned up to 16,000 IOPS and 1,000 MB/s. Past that the ' +
			'answer is io2 Block Express, not another gp3.'
	},
	{
		category: 'performance',
		label: 'Cache before you scale',
		body:
			'CloudFront at the edge, ElastiCache in front of a database, DAX in front of DynamoDB — ' +
			'all cheaper and faster than moving to a larger instance.'
	},
	{
		category: 'performance',
		label: 'Layer 4 or layer 7',
		body:
			'Path and host routing, or anything HTTP-aware, means an Application Load Balancer. ' +
			'Extreme throughput, static IPs or non-HTTP protocols mean a Network Load Balancer.'
	},
	{
		category: 'performance',
		label: 'Move the data, not the instance',
		body:
			'Latency for distant users is solved at the edge or by replicating closer to them. ' +
			'A bigger origin instance does nothing about the speed of light.'
	},
	{
		category: 'performance',
		label: 'Placement groups have shapes',
		body:
			'Cluster keeps tightly coupled nodes close for lowest network latency. Spread keeps ' +
			'instances on distinct hardware, and partition suits large distributed systems.'
	},
	{
		category: 'performance',
		label: 'Decouple a spiky producer',
		body:
			'A fast producer overwhelming a slow consumer is a queue problem. SQS absorbs the burst ' +
			'and lets the consumer scale on queue depth instead of falling over.'
	},
	{
		category: 'cost',
		label: 'Spot suits interruptible work',
		body:
			'Spot capacity can be reclaimed after a two-minute warning. Batch jobs and stateless ' +
			'workers, yes; a database or anything holding state, no.'
	},
	{
		category: 'cost',
		label: 'Commit for the steady state',
		body:
			'A baseline running all year belongs on a Savings Plan or Reserved Instances, with ' +
			'On-Demand kept for the spiky part sitting on top of it.'
	},
	{
		category: 'cost',
		label: 'Lifecycle rules, not tidying scripts',
		body:
			'Ageing objects into infrequent access, then a Glacier tier, then expiry, is an S3 ' +
			'lifecycle policy. A scheduled script someone maintains is the distractor.'
	},
	{
		category: 'cost',
		label: 'Intelligent-Tiering for unknown access',
		body:
			'When the access pattern is unpredictable, S3 Intelligent-Tiering moves objects for a ' +
			'small monitoring charge and charges no retrieval fee for doing so.'
	},
	{
		category: 'cost',
		label: 'Gateway endpoints are free',
		body:
			'Gateway VPC endpoints for S3 and DynamoDB cost nothing and take that traffic off the ' +
			'NAT gateway, removing its per-gigabyte processing charge.'
	},
	{
		category: 'cost',
		label: 'Right-size before re-architecting',
		body:
			'When the question wants the cheapest change with the least disruption, resizing ' +
			'instances or changing a storage class usually beats a redesign.'
	}
];

/**
 * Returns the library in a seeded shuffled order.
 *
 * The order is stable for a given seed, so a ticker rebuilt mid-attempt — a re-render, a
 * panel reopened — carries on with the same sequence rather than jumping somewhere new.
 *
 * @param seed Any 32-bit integer, normally the attempt's seed.
 * @param category Optional filter, when only one family of advice is wanted.
 */
export function shuffledTips(seed: number, category?: TipCategory): LibraryTip[] {
	const pool = category ? LIBRARY.filter((tip) => tip.category === category) : LIBRARY;
	return shuffle(pool, createRandom(seed));
}
