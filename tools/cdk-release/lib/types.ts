export interface Lifecycles {
  bump?: string;
  changelog?: string;
  postchangelog?: string;
  commit?: string;

  // we don't actually do tagging at all, but still support passing it as an option,
  // for conformance with standard-version (CDK doesn't use its tagging capabilities anyway)
  tag?: string;
}

export type LifecyclesSkip = {
  [key in keyof Lifecycles]: boolean;
}

export interface Versions {
  stableVersion: string;
  alphaVersion?: string;
}

export type ReleaseType = 'major' | 'minor' | 'patch';

/** How to handle experimental changes in the changelog. */
export enum ExperimentalChangesTreatment {
  /** experimental changes are included in the main changelog (this is the default) */
  INCLUDE = 'include',
  /** remove all experimental changes from the changelog */
  STRIP = 'strip',
  /** write experimental changes to individual changelogs, and into a separate section of the main changelog. */
  SEPARATE = 'separate'
};

export interface ReleaseOptions {
  releaseAs: ReleaseType;
  skip?: LifecyclesSkip;
  versionFile: string;
  changelogFile: string;
  alphaChangelogFile?: string;
  prerelease?: string;
  scripts?: Lifecycles;
  dryRun?: boolean;
  verbose?: boolean;
  silent?: boolean;
  sign?: boolean;

  /**
   * How to handle experimental changes in the changelog.
   * @default ExperimentalChangesTreatment.INCLUDE
   */
  experimentalChangesTreatment?: ExperimentalChangesTreatment;
  changeLogHeader?: string;
  includeDateInChangelog?: boolean;
  releaseCommitMessageFormat?: string;
}

export interface PackageInfo {
  name: string;
  location: string;
  alpha: boolean;
}
