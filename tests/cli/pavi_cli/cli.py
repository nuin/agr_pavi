"""`pavi-cli` entry point."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import click

from .api_client import DEFAULT_BASE_URL, DEFAULT_TIMEOUT_S, PaviApiClient
from .catalog import find_example, load_catalog
from .payloads import extract_from_local_store, payload_fixture_path, save_payload
from .runner import format_report, run_example, write_json_report


@click.group()
def main() -> None:
    """End-to-end validation harness for PAVI example datasets."""


@main.command("list")
def list_examples() -> None:
    """Print the example catalog."""
    examples = load_catalog()
    width = max(len(e.id) for e in examples)
    for ex in examples:
        click.echo(f"  {ex.id:{width}}  {ex.category:14s}  {ex.name}")
    click.echo(f"\n{len(examples)} examples total.")


@main.command("run")
@click.option("--example", "example_id", required=True, help="Catalog example id.")
@click.option("--api", "base_url", default=DEFAULT_BASE_URL, show_default=True)
@click.option(
    "--timeout", "timeout_s", default=DEFAULT_TIMEOUT_S, show_default=True,
    type=float, help="Max seconds to wait for the pipeline to complete.",
)
def run_one(example_id: str, base_url: str, timeout_s: float) -> None:
    examples = load_catalog()
    example = find_example(examples, example_id)
    if example is None:
        click.echo(f"Unknown example {example_id!r}", err=True)
        sys.exit(2)
    client = PaviApiClient(base_url=base_url)
    result = run_example(client, example, timeout_s=timeout_s)
    click.echo(format_report([result]))
    sys.exit(0 if result.ok else 1)


@main.command("run-all")
@click.option("--api", "base_url", default=DEFAULT_BASE_URL, show_default=True)
@click.option(
    "--timeout", "timeout_s", default=DEFAULT_TIMEOUT_S, show_default=True,
    type=float,
)
@click.option("--json-report", "json_report", type=click.Path(dir_okay=False))
def run_all(base_url: str, timeout_s: float, json_report: str | None) -> None:
    examples = load_catalog()
    client = PaviApiClient(base_url=base_url)
    results = [run_example(client, ex, timeout_s=timeout_s) for ex in examples]
    click.echo(format_report(results))
    if json_report:
        write_json_report(results, json_report)
        click.echo(f"\nJSON report written to {json_report}")
    sys.exit(0 if all(r.ok for r in results) else 1)


@main.command("capture-payload")
@click.option("--example", "example_id", required=True)
@click.option("--job-uuid", "job_uuid", required=True)
@click.option(
    "--jobs-db", "jobs_db",
    default=lambda: os.environ.get("PAVI_LOCAL_JOBS_PATH", "/tmp/pavi/jobs") + "/jobs.db",
    show_default="$PAVI_LOCAL_JOBS_PATH/jobs.db or /tmp/pavi/jobs/jobs.db",
)
def capture_payload(example_id: str, job_uuid: str, jobs_db: str) -> None:
    """Extract a known-good payload from the API's local job store and save it as the example's fixture."""
    examples = load_catalog()
    if find_example(examples, example_id) is None:
        click.echo(f"Unknown example {example_id!r}", err=True)
        sys.exit(2)
    payload = extract_from_local_store(Path(jobs_db), job_uuid)
    path = save_payload(example_id, payload)
    click.echo(f"Captured {len(payload)} seq_regions for {example_id!r} -> {path}")


@main.command("payload-path")
@click.option("--example", "example_id", required=True)
def payload_path(example_id: str) -> None:
    """Print where the payload fixture for an example would be read from."""
    click.echo(payload_fixture_path(example_id))


if __name__ == "__main__":
    main()
