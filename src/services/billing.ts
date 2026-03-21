/**
 * Billing Rules Service
 * Manages space/folder/tag billing classification stored in SQLite.
 * Priority order: folder rule > space rule > tag rule > default (non-billable)
 */

import { getDb } from "../db/store";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RuleType = "space" | "folder" | "tag";
export type Classification = "billable" | "non-billable";

export interface BillingRule {
  id: number;
  ruleType: RuleType;
  matchId: string | null;
  matchName: string | null;
  classification: Classification;
  clientName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBillingRuleInput {
  ruleType: RuleType;
  matchId?: string;
  matchName?: string;
  classification: Classification;
  clientName?: string;
}

export interface UpdateBillingRuleInput {
  matchName?: string;
  classification?: Classification;
  clientName?: string;
}

// ── Seed data ─────────────────────────────────────────────────────────────────

const DEFAULT_SEED: Array<Omit<BillingRule, "id" | "createdAt" | "updatedAt">> = [
  // Billable spaces
  { ruleType: "space", matchId: "90189540735", matchName: "Client Delivery",                classification: "billable",     clientName: null },
  { ruleType: "space", matchId: "90189581720", matchName: "ES Project 2026",                classification: "billable",     clientName: null },
  { ruleType: "space", matchId: "90188985670", matchName: "ES : Enterprise Support",        classification: "billable",     clientName: null },
  { ruleType: "space", matchId: "90188986437", matchName: "BS : Business Support",          classification: "billable",     clientName: null },
  { ruleType: "space", matchId: "90189961808", matchName: "BS : Business solution",         classification: "billable",     clientName: null },
  { ruleType: "space", matchId: "90189542049", matchName: "Product Delivery",               classification: "billable",     clientName: null },
  { ruleType: "space", matchId: "90189463862", matchName: "Production Support",             classification: "billable",     clientName: null },
  // Non-billable spaces
  { ruleType: "space", matchId: "90189540778", matchName: "Product Development",            classification: "non-billable", clientName: null },
  { ruleType: "space", matchId: "90185611850", matchName: "Tigersoft Dev New Product",      classification: "non-billable", clientName: null },
  { ruleType: "space", matchId: "90182782245", matchName: "Tigersoft Tech Team",            classification: "non-billable", clientName: null },
  { ruleType: "space", matchId: "90189540791", matchName: "People & Operations",            classification: "non-billable", clientName: null },
  { ruleType: "space", matchId: "90189540630", matchName: "Management & Strategy",          classification: "non-billable", clientName: null },
  { ruleType: "space", matchId: "90186050362", matchName: "QA",                             classification: "non-billable", clientName: null },
  { ruleType: "space", matchId: "90188214819", matchName: "IT",                             classification: "non-billable", clientName: null },
  { ruleType: "space", matchId: "90189406436", matchName: "Personal Task",                  classification: "non-billable", clientName: null },
  { ruleType: "space", matchId: "90189575439", matchName: "Tiger Space",                    classification: "non-billable", clientName: null },
  { ruleType: "space", matchId: "90188909955", matchName: "Roadmap Software development",   classification: "non-billable", clientName: null },
  { ruleType: "space", matchId: "90189670654", matchName: "AI : Teams",                     classification: "non-billable", clientName: null },
  { ruleType: "space", matchId: "901810085735", matchName: "AI Project",                    classification: "non-billable", clientName: null },
];

// ── Serialization ─────────────────────────────────────────────────────────────

function deserializeRule(row: Record<string, unknown>): BillingRule {
  return {
    id:             row.id as number,
    ruleType:       row.rule_type as RuleType,
    matchId:        (row.match_id as string | null) ?? null,
    matchName:      (row.match_name as string | null) ?? null,
    classification: row.classification as Classification,
    clientName:     (row.client_name as string | null) ?? null,
    createdAt:      row.created_at as string,
    updatedAt:      row.updated_at as string,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function listBillingRules(): BillingRule[] {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM timesheet_billing_rules ORDER BY rule_type, match_name"
  );
  const rows = stmt.all({}) as Record<string, unknown>[];
  return rows.map(deserializeRule);
}

export function createBillingRule(input: CreateBillingRuleInput): BillingRule {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO timesheet_billing_rules
      (rule_type, match_id, match_name, classification, client_name)
    VALUES
      ($rule_type, $match_id, $match_name, $classification, $client_name)
  `);
  const result = stmt.run({
    $rule_type:      input.ruleType,
    $match_id:       input.matchId ?? null,
    $match_name:     input.matchName ?? null,
    $classification: input.classification,
    $client_name:    input.clientName ?? null,
  });

  const row = db
    .prepare("SELECT * FROM timesheet_billing_rules WHERE id = $id")
    .get({ $id: result.lastInsertRowid }) as Record<string, unknown>;
  return deserializeRule(row);
}

export function updateBillingRule(
  id: number,
  patch: UpdateBillingRuleInput
): BillingRule | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM timesheet_billing_rules WHERE id = $id")
    .get({ $id: id }) as Record<string, unknown> | null;
  if (!existing) return null;

  const current = deserializeRule(existing);
  const newMatchName     = patch.matchName     !== undefined ? patch.matchName     : current.matchName;
  const newClassification= patch.classification !== undefined ? patch.classification : current.classification;
  const newClientName    = patch.clientName    !== undefined ? patch.clientName    : current.clientName;

  db.prepare(`
    UPDATE timesheet_billing_rules
    SET match_name = $match_name,
        classification = $classification,
        client_name = $client_name,
        updated_at = datetime('now')
    WHERE id = $id
  `).run({
    $id:             id,
    $match_name:     newMatchName,
    $classification: newClassification,
    $client_name:    newClientName,
  });

  const row = db
    .prepare("SELECT * FROM timesheet_billing_rules WHERE id = $id")
    .get({ $id: id }) as Record<string, unknown>;
  return deserializeRule(row);
}

export function deleteBillingRule(id: number): boolean {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM timesheet_billing_rules WHERE id = $id")
    .run({ $id: id });
  return result.changes > 0;
}

export function getBillingRuleByMatchId(matchId: string, ruleType: RuleType): BillingRule | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM timesheet_billing_rules WHERE match_id = $match_id AND rule_type = $rule_type LIMIT 1"
    )
    .get({ $match_id: matchId, $rule_type: ruleType }) as Record<string, unknown> | null;
  return row ? deserializeRule(row) : null;
}

export function seedBillingRules(): { seeded: number; skipped: boolean } {
  const db = getDb();
  const count = (
    db.prepare("SELECT COUNT(*) as c FROM timesheet_billing_rules").get({}) as { c: number }
  ).c;

  if (count > 0) {
    return { seeded: 0, skipped: true };
  }

  const stmt = db.prepare(`
    INSERT INTO timesheet_billing_rules
      (rule_type, match_id, match_name, classification, client_name)
    VALUES
      ($rule_type, $match_id, $match_name, $classification, $client_name)
  `);

  for (const rule of DEFAULT_SEED) {
    stmt.run({
      $rule_type:      rule.ruleType,
      $match_id:       rule.matchId,
      $match_name:     rule.matchName,
      $classification: rule.classification,
      $client_name:    rule.clientName,
    });
  }

  return { seeded: DEFAULT_SEED.length, skipped: false };
}

// ── Classification resolver ───────────────────────────────────────────────────

export interface BillingClassifier {
  classify(spaceId: string, folderId?: string, tags?: string[]): Classification;
  clientFor(spaceId: string, folderId?: string): string;
}

/**
 * Builds a fast in-memory classifier from the current billing rules.
 * Call this once per request to avoid repeated DB reads.
 */
export function buildClassifier(): BillingClassifier {
  const rules = listBillingRules();

  // Build separate lookup maps by type
  const spaceMap  = new Map<string, BillingRule>();
  const folderMap = new Map<string, BillingRule>();
  const tagMap    = new Map<string, BillingRule>();

  for (const rule of rules) {
    if (rule.matchId) {
      if (rule.ruleType === "space")  spaceMap.set(rule.matchId, rule);
      if (rule.ruleType === "folder") folderMap.set(rule.matchId, rule);
      if (rule.ruleType === "tag")    tagMap.set(rule.matchId, rule);
    }
  }

  function classify(spaceId: string, folderId?: string, tags?: string[]): Classification {
    // Priority: folder > space > tag > default non-billable
    if (folderId && folderMap.has(folderId)) {
      return folderMap.get(folderId)!.classification;
    }
    if (spaceMap.has(spaceId)) {
      return spaceMap.get(spaceId)!.classification;
    }
    if (tags) {
      for (const tag of tags) {
        if (tagMap.has(tag)) {
          return tagMap.get(tag)!.classification;
        }
      }
    }
    return "non-billable";
  }

  function clientFor(spaceId: string, folderId?: string): string {
    if (folderId) {
      const fr = folderMap.get(folderId);
      if (fr?.clientName) return fr.clientName;
    }
    const sr = spaceMap.get(spaceId);
    if (sr?.clientName) return sr.clientName;
    return "Internal";
  }

  return { classify, clientFor };
}
