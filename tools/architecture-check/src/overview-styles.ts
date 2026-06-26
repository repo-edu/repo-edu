import { overviewCoverStyles } from "./overview-cover-styles.js"
import { overviewFilesStyles } from "./overview-files-styles.js"
import { overviewPageStyles } from "./overview-page-styles.js"
import { overviewTreemapStyles } from "./overview-treemap-styles.js"

export const areaOverviewStyles = [
  overviewPageStyles,
  overviewTreemapStyles,
  overviewCoverStyles,
  overviewFilesStyles,
].join("\n\n")
