import type { SearchQueryConfig } from './models';

// Mirrors compileSearchQuery in src/utils/search-query.ts so the builder can preview without a round trip.
export function compileSearchQuery(config: SearchQueryConfig): string {
  const groupTexts: string[] = [];

  for (const group of config.groups) {
    const filledTerms = group.terms.filter((term) => term.trim().length > 0);
    const hasTerms = filledTerms.length > 0;
    if (!hasTerms) continue;

    const quotedTerms = filledTerms.map((term) => `"${term.trim()}"`);
    const isSingleTerm = quotedTerms.length === 1;
    const joined = quotedTerms.join(` ${group.operator} `);
    const groupText = isSingleTerm ? joined : `(${joined})`;

    groupTexts.push(groupText);
  }

  const query = groupTexts.join(` ${config.groupOperator} `);

  return query;
}
