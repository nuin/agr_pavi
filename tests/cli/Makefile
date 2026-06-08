.PHONY: install run-quick run-all list capture-payload help

PYTHON ?= python3.12
VENV   ?= .venv
PIP    := $(VENV)/bin/pip
CLI    := $(VENV)/bin/pavi-cli

API       ?= http://localhost:8000
EXAMPLE   ?= tp53-orthologs
TIMEOUT   ?= 300
JOB_UUID  ?=

help:
	@echo "Targets:"
	@echo "  make install                          create venv + install pavi-cli"
	@echo "  make list                             show the example catalog"
	@echo "  make run-quick EXAMPLE=<id>           run one example end-to-end"
	@echo "  make run-all                          run every example, fail on first miss"
	@echo "  make capture-payload EXAMPLE=<id> JOB_UUID=<uuid>"
	@echo "                                        snapshot a known-good payload into fixtures/"
	@echo ""
	@echo "Variables: API=$(API)  TIMEOUT=$(TIMEOUT)"

install: $(VENV)/bin/activate

$(VENV)/bin/activate:
	$(PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -e .

list: install
	$(CLI) list

run-quick: install
	$(CLI) run --example $(EXAMPLE) --api $(API) --timeout $(TIMEOUT)

run-all: install
	$(CLI) run-all --api $(API) --timeout $(TIMEOUT) --json-report run-all-report.json

capture-payload: install
	@if [ -z "$(JOB_UUID)" ]; then echo "JOB_UUID=<uuid> required" >&2; exit 2; fi
	$(CLI) capture-payload --example $(EXAMPLE) --job-uuid $(JOB_UUID)
