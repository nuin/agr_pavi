# PAVI Documentation

This directory contains documentation for the PAVI (Proteins Annotations and Variants Inspector) project.

## Documentation Index

### Deployment Guides

| Document | Description |
|----------|-------------|
| [Local EC2 Deployment](local-ec2-deployment.md) | Complete guide for deploying PAVI on a single EC2 instance without AWS infrastructure |
| [Step Functions Design](step-functions-design.md) | AWS Step Functions architecture for production deployment |

### Implementation Details

| Document | Description |
|----------|-------------|
| [Local Pipeline Implementation](local-pipeline-implementation.md) | Technical details of the local pipeline code changes |
| [Clustal Omega Build](clustal-omega-build.md) | Building Clustal Omega from source on Amazon Linux 2023 |
| [Python Environment Setup](python-environment-setup.md) | Setting up Python with uv, ruff, and mypy |

### Project Overview

| Document | Description |
|----------|-------------|
| [CLAUDE.md](../CLAUDE.md) | Main project guidelines and development instructions |
| [WebUI README](../webui/README.md) | Frontend documentation |

## Quick Start

### Local EC2 Deployment

1. **Install system dependencies:**
   ```bash
   sudo yum install -y gcc gcc-c++ make cmake autoconf automake libtool git
   ```

2. **Build and install Clustal Omega:**
   ```bash
   # See clustal-omega-build.md for detailed instructions
   cd /tmp
   git clone https://github.com/jonathanmarvens/argtable2.git
   # ... build argtable2 ...
   git clone https://github.com/GSLBiotech/clustal-omega.git
   # ... build clustalo ...
   ```

3. **Set up Python environment:**
   ```bash
   cd /home/ec2-user/agr_pavi/api
   uv venv --python 3.12 .venv
   uv pip install -r requirements.txt ruff mypy
   ```

4. **Create data directories:**
   ```bash
   sudo mkdir -p /var/lib/pavi/{jobs,results,work}
   sudo chown -R ec2-user:ec2-user /var/lib/pavi
   ```

5. **Start the API:**
   ```bash
   cd /home/ec2-user/agr_pavi/api/src
   USE_LOCAL_PIPELINE=true ../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
   ```

6. **Verify:**
   ```bash
   curl http://localhost:8000/api/health
   ```

## Architecture Overview

### AWS Production Architecture

```
WebUI → API (Elastic Beanstalk) → Step Functions → AWS Batch → S3
                                        ↓
                                    DynamoDB
```

### Local EC2 Architecture

```
WebUI → API (uvicorn) → LocalPipelineRunner → clustalo → Local FS
                               ↓
                            SQLite
```

## Key Components

| Component | Production | Local EC2 |
|-----------|------------|-----------|
| Job Storage | DynamoDB | SQLite |
| Result Storage | S3 | Local filesystem |
| Orchestration | Step Functions | LocalPipelineRunner |
| Compute | AWS Batch | Direct Python execution |
| Alignment | Containerized clustalo | Local clustalo binary |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_LOCAL_PIPELINE` | `false` | Enable local pipeline mode |
| `PAVI_LOCAL_JOBS_PATH` | `/var/lib/pavi/jobs` | SQLite database directory |
| `PAVI_LOCAL_RESULTS_PATH` | `/var/lib/pavi/results` | Final results directory |
| `PAVI_LOCAL_WORK_PATH` | `/var/lib/pavi/work` | Work files directory |
| `PAVI_LOCAL_MAX_WORKERS` | `4` | Parallel sequence retrievals |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/deployment-status` | GET | Detailed component status |
| `/api/pipeline-job/` | POST | Submit alignment job |
| `/api/pipeline-job/{uuid}` | GET | Get job status |
| `/api/pipeline-job/{uuid}/result/alignment` | GET | Get alignment result |
| `/api/pipeline-job/{uuid}/result/seq-info` | GET | Get sequence info |

## File Structure

```
/home/ec2-user/agr_pavi/
├── api/
│   └── src/
│       ├── config.py          # Configuration
│       ├── main.py            # FastAPI app
│       ├── job_service.py     # Job management
│       ├── local_job_store.py # SQLite storage
│       └── local_pipeline.py  # Local execution
├── pipeline_components/
│   ├── seq_retrieval/         # Sequence retrieval
│   └── alignment/             # Alignment container
├── webui/                     # Next.js frontend
└── docs/                      # This documentation

/var/lib/pavi/
├── jobs/
│   └── jobs.db               # SQLite database
├── work/
│   └── {job_id}/             # Work files
└── results/
    └── {job_id}/             # Final results
```

## Development

### Code Quality Checks

```bash
cd /home/ec2-user/agr_pavi/api

# Linting
.venv/bin/ruff check src/

# Type checking
.venv/bin/mypy src/ --ignore-missing-imports
```

### Testing

```bash
# Submit test job
curl -X POST http://localhost:8000/api/pipeline-job/ \
  -H "Content-Type: application/json" \
  -d '[...]'

# Check job status
curl http://localhost:8000/api/pipeline-job/{uuid}
```

## Troubleshooting

See individual documentation files for detailed troubleshooting:

- **clustalo issues**: [clustal-omega-build.md](clustal-omega-build.md#troubleshooting)
- **Python issues**: [python-environment-setup.md](python-environment-setup.md#troubleshooting)
- **Pipeline issues**: [local-ec2-deployment.md](local-ec2-deployment.md#troubleshooting)

## Contributing

1. Follow the coding conventions in [CLAUDE.md](../CLAUDE.md)
2. Run `ruff` and `mypy` before submitting changes
3. Update documentation for any new features
