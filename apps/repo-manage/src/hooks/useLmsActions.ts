import { useLmsFormStore, useOutputStore } from "../stores";
import * as lmsService from "../services/lmsService";
import { useProgressChannel, handleProgressMessage } from "./useProgressChannel";
import { validateLms } from "../validation/forms";

/**
 * Hook providing LMS-related actions (verify course, generate files).
 */
export function useLmsActions() {
  const lmsForm = useLmsFormStore();
  const output = useOutputStore();

  const verifyLmsCourse = async () => {
    const lmsValidation = validateLms(lmsForm.getState());
    if (!lmsValidation.valid) {
      output.appendWithNewline("⚠ Cannot verify: fix LMS form errors first");
      return;
    }
    const lms = lmsForm.getState();
    const lmsLabel = lms.lmsType || "LMS";
    output.appendWithNewline(`Verifying ${lmsLabel} course...`);

    try {
      const result = await lmsService.verifyLmsCourse({
        base_url: lms.urlOption === "CUSTOM" ? lms.customUrl : lms.baseUrl,
        access_token: lms.accessToken,
        course_id: lms.courseId,
        lms_type: lms.lmsType,
      });

      output.appendWithNewline(result.message);
      if (result.details) {
        output.appendWithNewline(result.details);
      }

      // Extract course name from details and update form
      if (result.details) {
        const match = result.details.match(/Course Name: (.+)/);
        if (match) {
          lmsForm.setField("courseName", match[1]);
        }
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      output.appendWithNewline(`✗ Error: ${errorMessage}`);
      if (error?.details) {
        output.appendWithNewline(error.details);
      }
    }
  };

  const handleGenerateFiles = async () => {
    output.appendWithNewline("Generating student info files...");

    try {
      const lms = lmsForm.getState();
      const progress = useProgressChannel({
        onProgress: (line) =>
          handleProgressMessage(line, output.appendWithNewline, output.updateLastLine),
      });

      const result = await lmsService.generateLmsFiles(
        {
          base_url: lms.urlOption === "CUSTOM" ? lms.customUrl : lms.baseUrl,
          access_token: lms.accessToken,
          course_id: lms.courseId,
          lms_type: lms.lmsType,
          yaml_file: lms.yamlFile,
          info_file_folder: lms.infoFileFolder,
          csv_file: lms.csvFile,
          xlsx_file: lms.xlsxFile,
          member_option: lms.memberOption,
          include_group: lms.includeGroup,
          include_member: lms.includeMember,
          include_initials: lms.includeInitials,
          full_groups: lms.fullGroups,
          csv: lms.csv,
          xlsx: lms.xlsx,
          yaml: lms.yaml,
        },
        progress
      );

      output.appendWithNewline(result.message);
      if (result.details) {
        output.appendWithNewline(result.details);
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      output.appendWithNewline(`⚠ Error: ${errorMessage}`);
      if (error?.details) {
        output.appendWithNewline(error.details);
      }
    }
  };

  return { verifyLmsCourse, handleGenerateFiles };
}
