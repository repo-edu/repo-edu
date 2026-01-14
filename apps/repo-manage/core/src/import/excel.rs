use crate::error::{PlatformError, Result};
use crate::import::csv::{parse_group_edit_rows, parse_student_rows, GroupEditEntry, HeaderInfo};
use crate::roster::StudentDraft;
use calamine::{open_workbook_auto, Data, Reader};
use std::path::Path;

pub fn parse_students_excel(path: &Path) -> Result<Vec<StudentDraft>> {
    let mut workbook = open_workbook_auto(path)
        .map_err(|e| PlatformError::Other(format!("Failed to open Excel file: {}", e)))?;

    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| PlatformError::Other("Excel file has no sheets".to_string()))?;

    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| PlatformError::Other(format!("Failed to read Excel sheet: {}", e)))?;

    let mut rows_iter = range.rows();
    let header_row = rows_iter
        .next()
        .ok_or_else(|| PlatformError::Other("Excel sheet is empty".to_string()))?;

    let headers = header_row
        .iter()
        .map(|cell| HeaderInfo {
            original: cell_to_string(cell).trim().to_string(),
            normalized: crate::import::normalize::normalize_header(&cell_to_string(cell)),
        })
        .collect::<Vec<_>>();

    let records = rows_iter.map(|row: &[Data]| {
        let record = row.iter().map(cell_to_string).collect::<Vec<_>>();
        Ok(csv::StringRecord::from(record))
    });

    parse_student_rows(&headers, records)
}

pub fn parse_group_edit_excel(path: &Path) -> Result<Vec<GroupEditEntry>> {
    let mut workbook = open_workbook_auto(path)
        .map_err(|e| PlatformError::Other(format!("Failed to open Excel file: {}", e)))?;

    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| PlatformError::Other("Excel file has no sheets".to_string()))?;

    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| PlatformError::Other(format!("Failed to read Excel sheet: {}", e)))?;

    let mut rows_iter = range.rows();
    let header_row = rows_iter
        .next()
        .ok_or_else(|| PlatformError::Other("Excel sheet is empty".to_string()))?;

    let headers = header_row
        .iter()
        .map(|cell| HeaderInfo {
            original: cell_to_string(cell).trim().to_string(),
            normalized: crate::import::normalize::normalize_header(&cell_to_string(cell)),
        })
        .collect::<Vec<_>>();

    let records = rows_iter.map(|row: &[Data]| {
        let record = row.iter().map(cell_to_string).collect::<Vec<_>>();
        Ok(csv::StringRecord::from(record))
    });

    parse_group_edit_rows(&headers, records)
}

fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        _ => cell.to_string(),
    }
}
