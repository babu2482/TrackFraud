#!/usr/bin/env python3
"""
The Glass House - Comprehensive Test Runner

This module provides a comprehensive test runner for The Glass House project.
It supports running all tests, specific test suites, and generating coverage reports.

Usage:
    python run_tests.py                      # Run all tests
    python run_tests.py --test=test_api/     # Run specific test directory
    python run_tests.py --cov               # Generate coverage report
    python run_tests.py --quick             # Run quick tests only
    python run_tests.py --verbose           # Verbose output
    python run_tests.py --test test_health.py -v  # Run specific test file

Requires:
    - pytest
    - pytest-cov
    - pytest-asyncio
    - pytest-xdist (for parallel execution)
    - pytest-html (for HTML reports)
"""

import argparse
import logging
import os
import sys
import tempfile
from pathlib import Path
from typing import List, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class TestRunner:
    """
    Comprehensive test runner for The Glass House project.

    Features:
    - Run all tests or specific test suites
    - Generate coverage reports (text, HTML, XML)
    - Parallel test execution
    - Custom test discovery
    - Detailed reporting
    """

    def __init__(
        self,
        test_directory: str = "tests",
        coverage: bool = False,
        verbose: bool = False,
        parallel: bool = False,
        html_report: bool = False,
        xml_report: bool = False,
        quick: bool = False,
        test_files: Optional[List[str]] = None,
        test_names: Optional[List[str]] = None,
    ):
        """
        Initialize the test runner.

        Args:
            test_directory: Directory containing tests
            coverage: Generate coverage report
            verbose: Verbose output
            parallel: Run tests in parallel
            html_report: Generate HTML report
            xml_report: Generate XML report (for CI/CD)
            quick: Run quick tests only (skip slow tests)
            test_files: Specific test files to run
            test_names: Specific test names to run
        """
        self.test_directory = test_directory
        self.coverage = coverage
        self.verbose = verbose
        self.parallel = parallel
        self.html_report = html_report
        self.xml_report = xml_report
        self.quick = quick
        self.test_files = test_files or []
        self.test_names = test_names or []

        # Setup paths
        self.project_root = Path(__file__).parent
        self.coverage_dir = self.project_root / "coverage"
        self.coverage_dir.mkdir(exist_ok=True)

        logger.info(f"Test directory: {self.test_directory}")
        logger.info(f"Coverage enabled: {self.coverage}")
        logger.info(f"Parallel execution: {self.parallel}")

    def build_pytest_args(self) -> List[str]:
        """
        Build pytest command line arguments.

        Returns:
            List of pytest arguments
        """
        args = []

        # Test directory/files
        if self.test_files:
            args.extend(self.test_files)
        else:
            args.append(self.test_directory)

        # Verbose output
        if self.verbose:
            args.extend(["-v", "-s"])

        # Quick mode - skip slow tests
        if self.quick:
            args.extend(["-m", "not slow"])

        # Coverage
        if self.coverage:
            args.extend(
                [
                    "--cov=app",
                    "--cov-report=term-missing",
                    "--cov-report=html:./coverage/html",
                    "--cov-report=xml:./coverage/coverage.xml",
                    "--cov-fail-under=70",
                    "--cov-config=.coveragerc"
                    if (self.project_root / ".coveragerc").exists()
                    else "",
                ]
            )

        # Parallel execution
        if self.parallel:
            args.extend(["-n", "auto"])

        # HTML report
        if self.html_report:
            args.extend(["--html=./coverage/report.html", "--self-contained-html"])

        # XML report (for CI/CD)
        if self.xml_report:
            args.extend(["--junitxml=./coverage/results.xml"])

        # Test names filter
        if self.test_names:
            args.extend(["-k", " ".join(self.test_names)])

        # Always add these
        args.extend(["--tb=short", "--strict-markers", "--asyncio-mode=auto"])

        return args

    def run_tests(self) -> int:
        """
        Run the tests using pytest.

        Returns:
            Exit code (0 for success, non-zero for failure)
        """
        import subprocess
        import sys

        logger.info("=" * 80)
        logger.info("Running The Glass House Test Suite")
        logger.info("=" * 80)

        # Build pytest arguments
        pytest_args = self.build_pytest_args()

        logger.info(f"Pytest command: pytest {' '.join(pytest_args)}")
        logger.info("-" * 80)

        # Run pytest
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pytest"] + pytest_args,
                cwd=str(self.project_root.parent),
            )
            return result.returncode
        except FileNotFoundError:
            logger.error(
                "pytest not found. Please install pytest: pip install pytest pytest-cov"
            )
            return 1
        except KeyboardInterrupt:
            logger.warning("\nTest execution interrupted by user")
            return 130

    def print_summary(self, exit_code: int) -> None:
        """
        Print test execution summary.

        Args:
            exit_code: Test execution exit code
        """
        logger.info("=" * 80)
        logger.info("Test Execution Summary")
        logger.info("=" * 80)

        if exit_code == 0:
            logger.info("✅ All tests passed!")
        else:
            logger.error("❌ Some tests failed")
            logger.info(f"   Exit code: {exit_code}")
            logger.info("   See output above for details")

        # Print coverage info if enabled
        if self.coverage:
            html_report = self.coverage_dir / "html" / "index.html"
            if html_report.exists():
                logger.info(f"\n📊 Coverage Report: {html_report.absolute()}")

            xml_report = self.coverage_dir / "coverage.xml"
            if xml_report.exists():
                logger.info(f"📄 XML Report: {xml_report.absolute()}")

        # Print other reports
        if self.html_report:
            report = self.coverage_dir / "report.html"
            if report.exists():
                logger.info(f"📄 HTML Report: {report.absolute()}")

        logger.info("=" * 80)

    def run(self) -> int:
        """
        Main entry point for test runner.

        Returns:
            Exit code
        """
        try:
            exit_code = self.run_tests()
            self.print_summary(exit_code)
            return exit_code
        except Exception as e:
            logger.error(f"Test runner error: {str(e)}")
            return 1


def parse_arguments() -> argparse.Namespace:
    """
    Parse command line arguments.

    Returns:
        Parsed arguments namespace
    """
    parser = argparse.ArgumentParser(
        description="The Glass House Test Runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python run_tests.py                      # Run all tests
    python run_tests.py --test=test_api/     # Run specific test directory
    python run_tests.py --cov                # Generate coverage report
    python run_tests.py --quick              # Run quick tests only
    python run_tests.py --verbose            # Verbose output
    python run_tests.py --test test_health.py -v  # Run specific test file
        """,
    )

    parser.add_argument(
        "--test",
        dest="test_dir",
        default="tests",
        help="Test directory to run (default: tests)",
    )

    parser.add_argument(
        "--test-file",
        dest="test_files",
        nargs="*",
        help="Specific test files to run",
    )

    parser.add_argument(
        "--test-name",
        dest="test_names",
        nargs="*",
        help="Specific test names to run",
    )

    parser.add_argument(
        "--cov",
        dest="coverage",
        action="store_true",
        help="Generate coverage report",
    )

    parser.add_argument(
        "--cov-fail-under",
        dest="cov_fail_under",
        type=int,
        default=70,
        help="Minimum coverage percentage (default: 70)",
    )

    parser.add_argument(
        "-v",
        "--verbose",
        dest="verbose",
        action="store_true",
        help="Verbose output",
    )

    parser.add_argument(
        "-q",
        "--quiet",
        dest="quiet",
        action="store_true",
        help="Quiet output",
    )

    parser.add_argument(
        "--quick",
        dest="quick",
        action="store_true",
        help="Run quick tests only (skip slow tests)",
    )

    parser.add_argument(
        "--parallel",
        dest="parallel",
        action="store_true",
        help="Run tests in parallel",
    )

    parser.add_argument(
        "--workers",
        dest="workers",
        type=int,
        default="auto",
        help="Number of parallel workers (default: auto)",
    )

    parser.add_argument(
        "--html",
        dest="html_report",
        action="store_true",
        help="Generate HTML report",
    )

    parser.add_argument(
        "--xml",
        dest="xml_report",
        action="store_true",
        help="Generate XML report (for CI/CD)",
    )

    parser.add_argument(
        "--log-file",
        dest="log_file",
        help="Log file path",
    )

    return parser.parse_args()


def main():
    """Main entry point."""
    args = parse_arguments()

    # Setup logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(level=log_level)

    logger.info("=" * 80)
    logger.info("🏛️ The Glass House Test Suite")
    logger.info("=" * 80)
    logger.info(f"Python version: {sys.version}")
    logger.info(f"Working directory: {os.getcwd()}")
    logger.info("-" * 80)

    # Create test runner
    runner = TestRunner(
        test_directory=args.test_dir,
        coverage=args.coverage,
        verbose=args.verbose,
        parallel=args.parallel,
        html_report=args.html_report,
        xml_report=args.xml_report,
        quick=args.quick,
        test_files=args.test_files,
        test_names=args.test_names,
    )

    # Run tests
    exit_code = runner.run()

    # Exit with appropriate code
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
