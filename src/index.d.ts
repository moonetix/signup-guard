export class SignupGuardError extends Error {
  readonly code:
    | 'invalid_argument'
    | 'invalid_option'
    | 'invalid_rule'
    | 'invalid_cidr'
    | 'data_error';
  constructor(code: string, message: string);
}

export type EmailChange =
  | 'trailing-dot-removed'
  | 'lowercased'
  | 'subdomain-tag-removed'
  | 'domain-alias'
  | 'tag-removed'
  | 'dots-removed';

export type EmailProblem =
  | 'empty'
  | 'non-ascii'
  | 'missing-at'
  | 'multiple-at'
  | 'too-long'
  | 'local-too-long'
  | 'local-invalid'
  | 'domain-literal'
  | 'domain-invalid';

export interface EmailProvider {
  readonly id: string;
  readonly name: string;
  readonly domains: readonly string[];
  readonly canonicalDomain: string | null;
  readonly plusTags: boolean;
  readonly ignoreDots: boolean;
  readonly subdomainTags: boolean;
  readonly sources: readonly string[];
  readonly note: string;
}

export const PROVIDERS: readonly EmailProvider[];
export const EMAIL_PROBLEMS: Readonly<Record<EmailProblem, string>>;

export interface NormalizeEmailOptions {
  /** Lowercase the part before @ for every domain. Default true. */
  lowercaseLocal?: boolean;
  /** Extra domains where a +tag is removed, for example ['outlook.com', 'example.org']. */
  plusTagDomains?: string[];
}

export type NormalizedEmail =
  | {
      valid: true;
      problem: null;
      address: string;
      normalized: string;
      local: string;
      domain: string;
      provider: string | null;
      changes: EmailChange[];
    }
  | {
      valid: false;
      problem: EmailProblem;
      address: string;
      normalized: null;
      local: null;
      domain: null;
      provider: null;
      changes: [];
    };

export function normalizeEmail(email: string, options?: NormalizeEmailOptions): NormalizedEmail;

export interface ParsedIp {
  version: 4 | 6;
  value: bigint;
}

export function parseIp(text: string): ParsedIp | null;
export function formatIp(ip: ParsedIp): string;
export function normalizeIp(text: string): string | null;
export function parseCidr(text: string): { version: 4 | 6; prefix: number; start: bigint; end: bigint; cidr: string };
export function ipNetwork(text: string): string | null;

export type SpecialKind =
  | 'reserved'
  | 'private'
  | 'cgnat'
  | 'loopback'
  | 'link-local'
  | 'documentation'
  | 'benchmarking'
  | 'multicast'
  | 'unspecified'
  | 'unique-local';

export interface SpecialRange {
  cidr: string;
  kind: SpecialKind;
  description: string;
}

export const SPECIAL_RANGES: readonly SpecialRange[];
export function specialRange(ip: ParsedIp): SpecialRange | null;

export type IpCategory = 'cloud' | 'services' | 'cdn' | 'tor' | 'privacy-relay';
export const IP_CATEGORIES: readonly IpCategory[];

export interface IpRangeInput {
  cidr: string;
  provider: string;
  providerName?: string;
  category: IpCategory;
}

export interface DataInfo {
  disposable?: { repository: string; file: string; license: string; commit: string; updatedAt: string; domains: number };
  ipRanges?: {
    repository: string;
    license: string;
    commit: string;
    updatedAt: string;
    ipv4: number;
    ipv6: number;
    providers: Record<string, { ipv4: number; ipv6: number }>;
  };
  counts: { disposableDomains: number; ipv4Ranges: number; ipv6Ranges: number };
}

export class GuardData {
  constructor(input?: { disposableDomains?: string[]; ipRanges?: IpRangeInput[]; info?: object | null });
  readonly counts: { disposableDomains: number; ipv4Ranges: number; ipv6Ranges: number };
}

export function createData(input: { disposableDomains?: string[]; ipRanges?: IpRangeInput[] }): GuardData;
export function loadData(dir?: string): GuardData;
export function defaultData(): GuardData;
export function dataInfo(): DataInfo;

export interface IpMatch {
  cidr: string;
  provider: string;
  providerName: string;
  category: IpCategory;
}

export interface IpLookup {
  valid: boolean;
  ip: string | null;
  version: 4 | 6 | null;
  public: boolean;
  special: SpecialRange | null;
  matches: IpMatch[];
  categories: IpCategory[];
}

export function lookupIp(ip: string, options?: { data?: GuardData }): IpLookup;

export interface DisposableOptions {
  data?: GuardData;
  /** Domains that are never disposable, matched with their subdomains. Wins over every list. */
  allowDomains?: string[];
  /** Extra disposable domains, matched with their subdomains. */
  blockDomains?: string[];
}

export interface DisposableResult {
  domain: string;
  disposable: boolean;
  matchedDomain: string | null;
  source: 'list' | 'blockDomains' | null;
  allowedBy: string | null;
}

export function checkDisposable(emailOrDomain: string, options?: DisposableOptions): DisposableResult;

export interface VelocityRule {
  name: string;
  /** 'ip', 'network' (IPv4 /24, IPv6 /64), 'email' (normalized), or the name of your own input field. */
  key: string;
  limit: number;
  windowSeconds: number;
}

export const DEFAULT_VELOCITY_RULES: readonly Readonly<VelocityRule>[];

export interface VelocityStore {
  /** Increment the counter at `key`, create it with a lifetime of `ttlSeconds` if missing, return the new count. */
  hit(key: string, ttlSeconds: number, now: number): number | Promise<number>;
}

export class MemoryStore implements VelocityStore {
  hit(key: string, ttlSeconds: number, now: number): number;
  prune(now: number): void;
  size(): number;
}

export interface VelocityRuleResult {
  rule: string;
  key: string;
  value: string;
  count: number;
  limit: number;
  windowSeconds: number;
  resetAt: number;
  exceeded: boolean;
}

export interface VelocityResult {
  limited: boolean;
  exceeded: string[];
  results: VelocityRuleResult[];
}

export class VelocityLimiter {
  constructor(options?: { store?: VelocityStore; rules?: VelocityRule[]; keyPrefix?: string });
  readonly rules: VelocityRule[];
  check(input: { now: number; ip?: string | null; email?: string | null; [field: string]: unknown }): Promise<VelocityResult>;
}

export type ReasonCode =
  | 'email_invalid'
  | 'email_disposable'
  | 'email_normalized'
  | 'ip_invalid'
  | 'ip_not_public'
  | 'ip_datacenter'
  | 'ip_tor'
  | 'ip_cdn'
  | 'ip_privacy_relay'
  | 'velocity_ip'
  | 'velocity_network'
  | 'velocity_email'
  | `velocity_${string}`;

export const DEFAULT_WEIGHTS: Readonly<Record<string, number>>;
export const DEFAULT_THRESHOLDS: Readonly<{ review: number; block: number }>;

export interface Reason {
  code: ReasonCode;
  points: number;
  /** For your logs and your review queue. */
  message: string;
  /** Safe to show to the person signing up, or null. */
  hint: string | null;
}

export interface AssessOptions extends NormalizeEmailOptions, DisposableOptions {
  /** Points per reason code. Unlisted custom velocity keys use velocity_other. */
  weights?: Partial<Record<ReasonCode | 'velocity_other', number>>;
  thresholds?: { review?: number; block?: number };
}

export interface Assessment {
  score: number;
  decision: 'allow' | 'review' | 'block';
  reasons: Reason[];
  email: NormalizedEmail | null;
  disposable: DisposableResult | null;
  ip: IpLookup | null;
}

export function assessSignup(
  input: { email?: string | null; ip?: string | null; velocity?: VelocityResult | null },
  options?: AssessOptions,
): Assessment;
