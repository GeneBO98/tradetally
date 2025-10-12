#!/bin/bash

# Script to mark all migrations as already applied
# Use this when the schema already exists but migrations table is empty

echo "[INFO] Marking all migrations as already applied..."

# Get all migration files
MIGRATION_DIR="/Users/brennonoverton/Projects/tradetally/backend/migrations"

# Counter
COUNT=0

# Process each migration file
for migration_file in $(ls -1 $MIGRATION_DIR/*.sql | sort); do
    filename=$(basename "$migration_file")

    # Skip if already in migrations table
    EXISTS=$(psql -U $USER -d tradetally -t -c "SELECT COUNT(*) FROM migrations WHERE filename = '$filename';" 2>/dev/null | xargs)

    if [ "$EXISTS" = "0" ]; then
        # Calculate checksum
        CHECKSUM=$(sha256sum "$migration_file" | awk '{print $1}')

        # Insert into migrations table
        psql -U $USER -d tradetally -c "INSERT INTO migrations (filename, checksum, applied_at) VALUES ('$filename', '$CHECKSUM', CURRENT_TIMESTAMP);" 2>/dev/null

        if [ $? -eq 0 ]; then
            echo "[SUCCESS] Marked as applied: $filename"
            COUNT=$((COUNT + 1))
        else
            echo "[WARNING] Could not mark: $filename (may already exist)"
        fi
    else
        echo "[SKIP] Already marked: $filename"
    fi
done

echo ""
echo "[COMPLETE] Marked $COUNT migrations as applied"
echo ""
echo "You can now start your application normally:"
echo "  cd /Users/brennonoverton/Projects/tradetally/backend"
echo "  npm run dev"