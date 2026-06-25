import { overviewCoverStyles } from "./overview-cover-styles.js"
import { overviewFilesStyles } from "./overview-files-styles.js"
import { overviewPageStyles } from "./overview-page-styles.js"
import { overviewResponsiveStyles } from "./overview-responsive-styles.js"
import { overviewTreemapStyles } from "./overview-treemap-styles.js"

export const areaOverviewStyles = [
  overviewPageStyles,
  overviewTreemapStyles,
  overviewCoverStyles,
  overviewFilesStyles,
  overviewResponsiveStyles,
].join("\n\n")
