#!/bin/bash
# Execute fix-supabase.sql on Supabase
# Run this with supabase CLI: supabase db execute -f fix-supabase.sql

if command -v supabase >/dev/null 2>&1; then
  echo "Executing fix-supabase.sql on Supabase..."
  supabase db execute -f fix-supabase.sql
  echo "Done."
else
  echo "Supabase CLI not found. Please run manually:"
  echo "supabase db execute -f fix-supabase.sql"
fi
