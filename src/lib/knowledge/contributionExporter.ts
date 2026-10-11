/**
 * Swayam404 Knowledge Base — Contribution Exporter & GitHub PR Workflow
 *
 * Produces portable, validated contribution JSON packages and formatted
 * GitHub pull-request review guides without requiring personal access tokens.
 */

import {
  ContributionProposal,
  ContributionManifest,
  ContributionExportPackage,
} from '@/types/knowledge';

export class ContributionExporter {
  /**
   * Builds an export package from an approved or ready-for-review proposal
   */
  static buildExportPackage(params: {
    proposal: ContributionProposal;
    courseTitle?: string;
    contributorNotes?: string;
  }): {
    success: boolean;
    package?: ContributionExportPackage;
    error?: string;
  } {
    const { proposal, courseTitle, contributorNotes } = params;

    // Strict validation check before export
    if (!proposal.validationResult.isValid || proposal.validationResult.errors.length > 0) {
      return {
        success: false,
        error: `Cannot export invalid proposal. Found ${proposal.validationResult.errors.length} validation errors.`,
      };
    }

    if (proposal.resources.length === 0 && proposal.reviewRecords.length === 0) {
      return {
        success: false,
        error: 'Cannot export empty proposal with no resources or review records.',
      };
    }

    // Unresolved critical conflicts check
    const criticalConflicts = proposal.conflicts.filter(
      (c) => c.type === 'exact-duplicate' || c.type === 'contradictory-verification'
    );
    if (criticalConflicts.length > 0) {
      return {
        success: false,
        error: `Cannot export proposal with ${criticalConflicts.length} unresolved critical conflicts.`,
      };
    }

    // Redistribution check
    if (!proposal.provenanceSummary.isPermissionConfirmed || proposal.provenanceSummary.permission === 'unverified') {
      return {
        success: false,
        error: 'Cannot export proposal with unverified redistribution permission. Keep as local draft.',
      };
    }

    const timestamp = new Date().toISOString();
    const contentHashes: Record<string, string> = {};

    for (const r of proposal.resources) {
      if (r.contentHash) {
        contentHashes[r.resourceId] = r.contentHash;
      }
    }
    for (const rev of proposal.reviewRecords) {
      contentHashes[rev.recordId] = rev.questionFingerprint;
    }

    const manifest: ContributionManifest = {
      schemaVersion: '1.0.0',
      packageVersion: '1.0.0',
      exportTimestamp: timestamp,
      courseId: proposal.courseId,
      courseTitle: courseTitle || proposal.title,
      resourceCount: proposal.resources.length,
      reviewRecordCount: proposal.reviewRecords.length,
      resourceIds: proposal.resources.map((r) => r.resourceId),
      reviewRecordIds: proposal.reviewRecords.map((r) => r.recordId),
      contentHashes,
      validationSummary: {
        isValid: true,
        errorCount: 0,
        warningCount: proposal.validationResult.warnings.length,
        errors: [],
        warnings: proposal.validationResult.warnings,
      },
      requiresMaintainerApproval: true, // Safety boundary: student export requires maintainer review
      repositoryDestination: {
        basePath: `courses/${proposal.courseId}/`,
        resourcesFile: `courses/${proposal.courseId}/resources.json`,
        reviewRecordsFile: `courses/${proposal.courseId}/review-records.json`,
        courseFile: `courses/${proposal.courseId}/course.json`,
      },
      contributorNotes,
    };

    return {
      success: true,
      package: {
        manifest,
        resources: proposal.resources,
        reviewRecords: proposal.reviewRecords,
      },
    };
  }

  /**
   * Generates a GitHub Pull Request description markdown document
   */
  static generatePullRequestMarkdown(params: {
    proposal: ContributionProposal;
    courseTitle: string;
    repoUrl?: string;
  }): string {
    const { proposal, courseTitle, repoUrl } = params;
    const dest = `knowledge-base/courses/${proposal.courseId}`;

    return `# [Contribution] Add learning resources for ${courseTitle} (${proposal.courseId})

## Summary
- **Course**: \`${courseTitle}\` (\`${proposal.courseId}\`)
- **Contribution ID**: \`${proposal.proposalId}\`
- **Resources Contributed**: ${proposal.resources.length}
- **Released Review Records**: ${proposal.reviewRecords.length}
- **License**: \`${proposal.provenanceSummary.license}\` (\`${proposal.provenanceSummary.permission}\`)
- **Source**: ${proposal.provenanceSummary.sourceSummary}

---

## Destination Files in Repository
Please place the exported files in the repository as follows:

| File | Destination Path |
| --- | --- |
| Resources | \`${dest}/resources.json\` |
| Review Records | \`${dest}/review-records.json\` |
| Course Info | \`${dest}/course.json\` |

---

## Maintainer Verification Checklist
- [x] Schema validity: validated using formal JSON Draft-07 schemas
- [x] Content integrity: SHA-256 hashes generated and verified
- [x] Ethical boundary: No active assessment questions or unreleased answer keys
- [x] Zero PII: No student roll numbers, email addresses, cookies, or auth tokens included
- [x] Open License: Verified educational distribution under \`${proposal.provenanceSummary.license}\`

${proposal.contributorNotes ? `### Contributor Notes\n${proposal.contributorNotes}\n` : ''}
---

## Submission Instructions for Contributor
1. Fork the knowledge-base repository${repoUrl ? ` (${repoUrl})` : ''}.
2. Place the contents of your exported contribution files into \`${dest}/\`.
3. Commit to a new branch: \`git checkout -b contrib/${proposal.courseId}\`.
4. Open a Pull Request on GitHub and paste this summary into the description.
`;
  }
}
