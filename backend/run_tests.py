#!/usr/bin/env python3
"""
Test runner script for Phase 1
"""
import subprocess
import sys
import os

def run_tests():
    """Run all tests"""
    print("=" * 80)
    print("Running Phase 1 Tests")
    print("=" * 80)
    
    # Change to backend directory
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    # Run pytest
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "tests/", "-v", "--tb=short"],
        capture_output=False,
        text=True
    )
    
    print("\n" + "=" * 80)
    print("Test Summary")
    print("=" * 80)
    
    if result.returncode == 0:
        print("✅ All tests passed!")
        return True
    else:
        print("❌ Some tests failed")
        return False


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)