# Noted — Deployment Guide

This guide covers deploying Noted to AWS using the provided CloudFormation
template. The stack runs on a single EC2 instance with Docker Compose, backed
by RDS-free PostgreSQL in a container, and S3 for encrypted note storage.

## Architecture

```
                   ┌─────────────────────────────┐
  Browser ──HTTP──▶│  EC2 (t3.small)              │
                   │  ┌─────────┐  ┌───────────┐  │
                   │  │ nginx   │  │  backend  │  │
                   │  │(port 80)│─▶│(port 3001)│  │──▶ S3 (encrypted notes)
                   │  └─────────┘  └─────┬─────┘  │
                   │                     │         │
                   │               ┌─────▼─────┐  │
                   │               │ PostgreSQL │  │
                   │               │(port 5432)│  │
                   │               └───────────┘  │
                   └─────────────────────────────┘
                         IAM Role (no static keys)
```

**Encryption layers:**
- Application: AES-256-GCM (your `ENCRYPTION_KEY`) — note content only
- S3: AES-256 server-side encryption — bucket-level
- EBS: Encrypted root volume — disk-level
- Secrets Manager: credentials encrypted at rest by AWS KMS

---

## Prerequisites

- AWS CLI v2 configured (`aws configure`) with permissions to create
  EC2, VPC, S3, IAM, and Secrets Manager resources
- An existing EC2 Key Pair in your target region
  ```bash
  aws ec2 create-key-pair --key-name noted-key --query 'KeyMaterial' \
    --output text > ~/.ssh/noted-key.pem
  chmod 400 ~/.ssh/noted-key.pem
  ```

---

## 1. Generate Strong Secrets

Before deploying, generate the three required secrets:

```bash
# Encryption key for note content (AES-256-GCM)
openssl rand -base64 32

# JWT secret for session tokens
openssl rand -base64 32

# PostgreSQL password
openssl rand -base64 24
```

Keep these somewhere safe — you'll need them for the deployment command.

---

## 2. Deploy the CloudFormation Stack

### Option A — AWS Console

1. Open **CloudFormation → Create stack → With new resources**
2. Upload `deploy/cloudformation.yml`
3. Fill in the parameters (secrets you generated above, key pair name, etc.)
4. Accept the IAM capabilities checkbox
5. Create stack — takes ~15 minutes (building Docker images on first boot)

### Option B — AWS CLI

```bash
aws cloudformation deploy \
  --stack-name noted \
  --template-file deploy/cloudformation.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    EncryptionKey="<your-encryption-key>" \
    JwtSecret="<your-jwt-secret>" \
    PostgresPassword="<your-postgres-password>" \
    KeyPairName="noted-key" \
    InstanceType="t3.small" \
    GitRepoUrl="https://github.com/rkinder/Noted.git" \
    GitBranch="master" \
    AllowedCidr="0.0.0.0/0" \
    SshCidr="<your-ip>/32"
```

Replace `<your-ip>` with your public IP (`curl ifconfig.me`) to lock down SSH.

---

## 3. After Deployment

CloudFormation outputs (visible in the Console under **Outputs** tab, or via CLI):

```bash
aws cloudformation describe-stacks --stack-name noted \
  --query 'Stacks[0].Outputs' --output table
```

| Output | Description |
|--------|-------------|
| `AppURL` | Open this in your browser |
| `SshCommand` | SSH into the server |
| `UpdateCommand` | Redeploy after code changes |
| `S3BucketName` | Bucket holding encrypted notes |
| `SetupLogCommand` | View the startup log |

**Wait ~15 minutes** for the first boot (Docker image build). The stack will
show `CREATE_COMPLETE` only after the EC2 signals success.

---

## 4. Updating the App

When you add features and push to the repo:

```bash
# SSH in and redeploy (from the UpdateCommand output)
ssh -i ~/.ssh/noted-key.pem ec2-user@<elastic-ip> \
  'cd /opt/noted && git pull && docker compose up --build -d'
```

Or use **SSM Session Manager** (no open SSH port needed):

```bash
aws ssm start-session --target <EC2InstanceId>
# then inside the session:
cd /opt/noted && git pull && docker compose up --build -d
```

---

## 5. Monitoring & Logs

```bash
ssh -i ~/.ssh/noted-key.pem ec2-user@<elastic-ip>

# All container logs
docker compose logs -f

# Backend only
docker compose logs -f backend

# Initial setup log
sudo cat /var/log/noted-setup.log

# Container status
docker compose ps
```

---

## 6. Adding HTTPS (Recommended)

The stack deploys over HTTP. For production use, add TLS:

**Option A — Cloudflare (easiest)**
1. Point a domain at the Elastic IP in Cloudflare DNS
2. Enable "Full" SSL mode in Cloudflare

**Option B — Certbot on the EC2**
```bash
ssh -i ~/.ssh/noted-key.pem ec2-user@<elastic-ip>

# Stop the frontend container temporarily
docker compose stop frontend

# Install Certbot and get a cert
sudo dnf install -y certbot
sudo certbot certonly --standalone -d your.domain.com

# Update nginx.conf and docker-compose to use port 443 + mount certs
# Then restart
docker compose up -d
```

---

## 7. Teardown

```bash
# Delete the stack (NOTE: the S3 bucket is retained by default to protect notes)
aws cloudformation delete-stack --stack-name noted

# To also delete the S3 bucket and its contents:
aws s3 rb s3://noted-<account-id>-<region> --force
```

---

## Cost Estimate (us-east-1, on-demand)

| Resource | Approx. Cost/Month |
|----------|--------------------|
| t3.small EC2 | ~$15 |
| 30 GB gp3 EBS | ~$2.40 |
| Elastic IP (attached) | Free |
| S3 storage (< 1 GB notes) | < $0.03 |
| Secrets Manager (1 secret) | $0.40 |
| Data transfer | ~$1 |
| **Total** | **~$19/month** |

Use a **t3.micro** (~$7.50/mo) for very light use / personal testing. Use a
**Reserved Instance** for a 40–60% discount on longer-term deployments.

---

## Parameter Reference

| Parameter | Default | Description |
|-----------|---------|-------------|
| `EncryptionKey` | _(required)_ | AES-256-GCM key for note content (≥16 chars) |
| `JwtSecret` | _(required)_ | JWT signing secret (≥16 chars) |
| `PostgresPassword` | _(required)_ | PostgreSQL password (≥8 chars) |
| `KeyPairName` | _(required)_ | EC2 Key Pair name (must exist in region) |
| `InstanceType` | `t3.small` | EC2 instance size |
| `GitRepoUrl` | `https://github.com/rkinder/Noted.git` | Repo to clone |
| `GitBranch` | `master` | Branch to deploy |
| `AllowedCidr` | `0.0.0.0/0` | CIDR allowed to reach port 80 |
| `SshCidr` | `0.0.0.0/0` | CIDR allowed to SSH (restrict to your IP) |

---

## Troubleshooting

**Stack stuck in CREATE_IN_PROGRESS for >25 min**
- The EC2 UserData script failed before signaling CloudFormation.
- Check the setup log: `sudo cat /var/log/noted-setup.log`
- Common causes: GitHub rate limit, disk full, Docker build failure.

**App not reachable after stack completes**
- Docker images are still building. Wait 2–3 more minutes and refresh.
- Check `docker compose ps` — all three containers should be `Up`.
- Ensure your `AllowedCidr` includes your IP.

**Containers keep restarting**
```bash
docker compose logs backend   # look for DB connection errors
docker compose logs postgres  # look for init errors
```

**S3 permission denied errors in backend logs**
- The EC2 IAM role should have S3 access automatically.
- Verify the role is attached: `curl http://169.254.169.254/latest/meta-data/iam/info`
- Check `STORAGE_TYPE=s3` and `S3_BUCKET_NAME` are set in `/opt/noted/.env`
