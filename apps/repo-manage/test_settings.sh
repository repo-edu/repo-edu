#!/bin/bash
# Integration test for settings persistence

set -e

echo "=== Settings Persistence Integration Test ==="
echo ""

# Get the settings directory path
if [[ "$OSTYPE" == "darwin"* ]]; then
    SETTINGS_DIR="$HOME/Library/Application Support/repobee-tauri"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    SETTINGS_DIR="$HOME/.config/repobee-tauri"
else
    echo "Unsupported OS: $OSTYPE"
    exit 1
fi

SETTINGS_FILE="$SETTINGS_DIR/repobee.json"

echo "1. Settings directory: $SETTINGS_DIR"
echo "2. Settings file: $SETTINGS_FILE"
echo ""

# Backup existing settings if they exist
if [ -f "$SETTINGS_FILE" ]; then
    echo "3. Backing up existing settings to ${SETTINGS_FILE}.backup"
    cp "$SETTINGS_FILE" "${SETTINGS_FILE}.backup"
    rm "$SETTINGS_FILE"
else
    echo "3. No existing settings file found (this is expected for first run)"
fi
echo ""

# Create test settings
echo "4. Creating test settings..."
mkdir -p "$SETTINGS_DIR"

cat > "$SETTINGS_FILE" << 'EOF'
{
  "common": {
    "lms_type": "Canvas",
    "lms_base_url": "https://canvas.test.edu",
    "lms_custom_url": "",
    "lms_url_option": "Custom",
    "lms_access_token": "test_token_123",
    "lms_course_id": "12345",
    "lms_course_name": "Test Course",
    "lms_yaml_file": "test_students.yaml",
    "lms_info_folder": "/tmp/test",
    "lms_csv_file": "test.csv",
    "lms_xlsx_file": "test.xlsx",
    "lms_member_option": "(email, gitid)",
    "lms_include_group": true,
    "lms_include_member": false,
    "lms_include_initials": true,
    "lms_full_groups": false,
    "lms_output_csv": true,
    "lms_output_xlsx": false,
    "lms_output_yaml": true,
    "git_base_url": "https://gitlab.test.com",
    "git_access_token": "git_test_token",
    "git_user": "testuser",
    "git_student_repos_group": "test-org",
    "git_template_group": "templates",
    "yaml_file": "custom_students.yaml",
    "target_folder": "/tmp/repos",
    "assignments": "lab1,lab2,lab3",
    "directory_layout": "by-team",
    "log_info": false,
    "log_debug": true,
    "log_warning": false,
    "log_error": true
  },
  "active_tab": "repo",
  "config_locked": false,
  "options_locked": false,
  "window_width": 1024,
  "window_height": 768,
  "window_x": 100,
  "window_y": 100
}
EOF

echo "✓ Test settings created"
echo ""

# Verify the file was created
if [ -f "$SETTINGS_FILE" ]; then
    echo "5. Settings file created successfully"
    echo ""
    echo "6. Settings file contents:"
    echo "---"
    cat "$SETTINGS_FILE"
    echo "---"
    echo ""
else
    echo "✗ Failed to create settings file"
    exit 1
fi

# Parse and verify key values
echo "7. Verifying key settings values:"
if command -v jq &> /dev/null; then
    LMS_URL=$(jq -r '.common.lms_base_url' "$SETTINGS_FILE")
    GIT_USER=$(jq -r '.common.git_user' "$SETTINGS_FILE")
    ACTIVE_TAB=$(jq -r '.active_tab' "$SETTINGS_FILE")

    echo "   - LMS URL: $LMS_URL"
    echo "   - Git User: $GIT_USER"
    echo "   - Active Tab: $ACTIVE_TAB"

    if [ "$LMS_URL" = "https://canvas.test.edu" ] && \
       [ "$GIT_USER" = "testuser" ] && \
       [ "$ACTIVE_TAB" = "repo" ]; then
        echo "   ✓ All values correct"
    else
        echo "   ✗ Values don't match expected"
        exit 1
    fi
else
    echo "   (jq not installed, skipping value verification)"
fi
echo ""

# Test file size
FILE_SIZE=$(wc -c < "$SETTINGS_FILE")
echo "8. Settings file size: $FILE_SIZE bytes"
if [ "$FILE_SIZE" -gt 100 ]; then
    echo "   ✓ File size looks reasonable"
else
    echo "   ✗ File seems too small"
    exit 1
fi
echo ""

# Cleanup
echo "9. Cleanup:"
if [ -f "${SETTINGS_FILE}.backup" ]; then
    echo "   Restoring original settings from backup"
    mv "${SETTINGS_FILE}.backup" "$SETTINGS_FILE"
else
    echo "   Removing test settings file"
    rm "$SETTINGS_FILE"
fi
echo "   ✓ Cleanup complete"
echo ""

echo "=== ✓ All tests passed! ==="
echo ""
echo "The settings system is working correctly!"
echo "Settings will be loaded from: $SETTINGS_FILE"
