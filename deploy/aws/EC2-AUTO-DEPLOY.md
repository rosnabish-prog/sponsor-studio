# Automatic production EC2 deployment from `development`

This guide applies to the **existing single-host Docker Compose deployment** of
Sponsor Studio. It does **not** create or change AWS resources automatically.
The GitHub workflow is `.github/workflows/deploy-ec2-production.yml`; the EC2
entrypoint is `scripts/deploy-ec2.sh` and the restricted Systems Manager document
is `deploy/aws/ssm-deploy-document.json`.

> **Production warning:** Every successful push to `development` can replace the
> application used by working annotators. Restrict who may push to this branch.
> Deploying a database migration is not generally reversible; this pipeline
> **does not automatically roll back schema or restore a database**. It fails,
> reports the error, and preserves the database and backup volumes for a
> controlled recovery. Do not turn it on until the recovery process is tested.

## 1. Inspect the running installation before changing it

On the production EC2 host, identify the current Compose project, checkout,
container names, and PostgreSQL volume. These commands are read-only:

```sh
docker compose ls
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker volume ls
```

**Do not invent a new Compose project name or move the checkout and blindly
restart it.** A different project name normally creates a different PostgreSQL
volume, making existing data appear missing. Keep the current project name and
database volume. The deployment script also requires an already running
PostgreSQL container in that exact Compose project; it refuses first-time
database creation.

The documented defaults are:

- Linux checkout: `/opt/sponsor-studio`, on branch `development`.
- Unix deploy account: `sponsor-deploy` (member of the Docker group).
- Public health URL: `https://sponsor-studio.seebot.ai/api/health`.
- Production Compose files: `compose.yaml` and `compose.prod.yaml`.

If production uses a **different** checkout directory, change both the SSM
document's script path and the script's `SPONSOR_STUDIO_DIR` configuration
before enabling deployment. Do not create a second checkout/project and assume
it is the existing production installation.

## 2. Prepare the EC2 instance

1. Ensure a current Docker Engine and Compose v2 plugin, Git, Bash, Python 3,
   `curl`, `flock` (from `util-linux`), and `sudo` are installed.
2. Ensure the existing `development` checkout is at `/opt/sponsor-studio`, is
   owned by the dedicated `sponsor-deploy` account, and is clean (`git status`).
   If it does not exist, arrange a first-time installation **separately**;
   this deployment script deliberately refuses to initialize production data.
3. Give `sponsor-deploy` access to the Docker daemon (typically via the
   `docker` group). Docker access is effectively root-level authority; restrict
   login access to this account. The SSM document executes the script as this
   user, not directly as root.
4. Keep the server's `.env` and `Caddyfile` outside Git. They are ignored by
   `.gitignore` and must not be replaced on deployments. If a Caddyfile is
   missing, use `deploy/aws/Caddyfile.example` as a starting point **only after
   confirming** DNS, proxy routing, and TLS for the real production domain.
5. Put the **existing** production database password and the existing Compose
   project name in `/opt/sponsor-studio/.env`. Example configuration (values
   are placeholders, do not paste these literally):

   ```dotenv
   COMPOSE_PROJECT_NAME=EXISTING_PROJECT_NAME_FROM_DOCKER_COMPOSE_LS
   DB_PASSWORD=EXISTING_DATABASE_PASSWORD
   AWS_REGION=YOUR_AWS_REGION
   S3_VIDEO_BUCKET=YOUR_VIDEO_BUCKET_IF_USED
   CLOUDFRONT_VIDEO_DOMAIN=YOUR_VIDEO_DOMAIN_IF_USED
   CLOUDFRONT_KEY_PAIR_ID=YOUR_KEY_ID_IF_USED
   CLOUDFRONT_PRIVATE_KEY=YOUR_PRIVATE_KEY_IF_USED
   BUILDUP_API_TOKEN=YOUR_BUILDUP_TOKEN_IF_USED
   ```

   Use restrictive ownership and `chmod 600 .env`. Do **not** rotate the
   existing PostgreSQL password just to configure CI/CD; changing
   `POSTGRES_PASSWORD` on an already initialized data volume does not change
   the password inside the database. The current Compose DATABASE_URL format
   also requires the DB password to be URL-safe. If it contains reserved URL
   characters, handle URL encoding before enabling the workflow.
6. Confirm `docker compose -f compose.yaml -f compose.prod.yaml config --quiet`
   succeeds and that `docker compose -f compose.yaml -f compose.prod.yaml ps
   postgres` points at the **existing** database. Confirm the existing site
   answers `/api/health` over HTTPS. EC2 needs outbound access to GitHub,
   Docker image registries, AWS Systems Manager, and the health URL.
7. Verify that the scheduled backup container works and that archives are
   copied off the EC2 host. The deployment takes a verified **additional**
   database archive before each migration/restart. See
   [backup and recovery instructions](../backups/README.md).

## 3. Configure AWS Systems Manager

1. Assign the EC2 instance an IAM instance role with
   `AmazonSSMManagedInstanceCore`, and verify the SSM Agent is online in
   **Systems Manager → Fleet Manager / Managed nodes**. Allow outbound access
   to regional SSM endpoints (or configure the corresponding VPC endpoints).
2. In the AWS account/region containing the EC2 instance, create the restricted
   **Command** document named exactly `SponsorStudioDeploy` from the tracked
   JSON file. With AWS CLI credentials that can administer SSM documents:

   ```sh
   aws ssm create-document \
     --name SponsorStudioDeploy \
     --document-type Command \
     --document-format JSON \
     --content file://deploy/aws/ssm-deploy-document.json
   ```

   If this document already exists, inspect its current contents/version
   instead of overwriting it. The document accepts only a 40-character commit
   SHA and runs the fixed deployment script as `sponsor-deploy`.

3. In IAM, create GitHub's OIDC identity provider with URL
   `https://token.actions.githubusercontent.com` and audience
   `sts.amazonaws.com` (skip if already configured).
4. Create a dedicated IAM role (example name `SponsorStudioDevelopmentDeploy`)
   with this **trust policy**. Replace `AWS_ACCOUNT_ID` with the real account ID:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Principal": {
         "Federated": "arn:aws:iam::AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
       },
       "Action": "sts:AssumeRoleWithWebIdentity",
       "Condition": {
         "StringEquals": {
           "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
           "token.actions.githubusercontent.com:sub": "repo:rosnabish-prog/sponsor-studio:ref:refs/heads/development"
         }
       }
     }]
   }
   ```

5. Give that role **only** permission to send the fixed document to the
   specific instance and read the result. Replace `AWS_REGION`,
   `AWS_ACCOUNT_ID`, and `EC2_INSTANCE_ID`:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "SendOnlySponsorStudioDeployToOneInstance",
         "Effect": "Allow",
         "Action": "ssm:SendCommand",
         "Resource": [
           "arn:aws:ssm:AWS_REGION:AWS_ACCOUNT_ID:document/SponsorStudioDeploy",
           "arn:aws:ec2:AWS_REGION:AWS_ACCOUNT_ID:instance/EC2_INSTANCE_ID"
         ]
       },
       {
         "Sid": "ReadDeploymentResult",
         "Effect": "Allow",
         "Action": "ssm:GetCommandInvocation",
         "Resource": "*"
       }
     ]
   }
   ```

   Do not grant `AdministratorAccess`, broad `ssm:SendCommand` permissions, or
   AWS access keys to GitHub. Restrict this IAM role to this repo/branch.

Official references: [GitHub Actions OIDC with AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws),
[AWS SSM instance permissions](https://docs.aws.amazon.com/systems-manager/latest/userguide/setup-instance-permissions.html),
[AWS Run Command](https://docs.aws.amazon.com/systems-manager/latest/userguide/run-command.html).

## 4. Set repository variables (not GitHub secrets)

In **GitHub → Sponsor Studio → Settings → Secrets and variables → Actions →
Variables**, set:

| Variable | Example / requirement |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::AWS_ACCOUNT_ID:role/SponsorStudioDevelopmentDeploy` |
| `AWS_REGION` | The region hosting this EC2 instance, e.g. `us-east-1` |
| `EC2_INSTANCE_ID` | The exact production instance ID, e.g. `i-0123456789abcdef0` |
| `EC2_AUTO_DEPLOY_ENABLED` | Leave **unset** until every preflight passes; then set `true` |

No long-lived AWS access keys or SSH private keys belong in GitHub. The
workflow requests short-lived AWS credentials via OIDC.

## 5. Validate, then explicitly enable automatic production deployment

1. Confirm the running Compose project, database volume, `.env`, Caddyfile,
   SSM managed-node status, OIDC role, and SSM document.
2. Run a **controlled first deployment** in a maintenance window using the
   target commit SHA and the same script (as the dedicated deploy user), or
   validate the SSM document manually. This performs a backup and may restart
   services; it is not a dry run.
3. Check that the newest backup is verified, the existing tasks and
   annotations are still present, and the HTTPS health endpoint succeeds.
4. Set `EC2_AUTO_DEPLOY_ENABLED=true`.
5. Push a small reviewed change to `development`. The
   [production deployment workflow](../../.github/workflows/deploy-ec2-production.yml)
   will run the build, tests, a live browser integration check, and only then
   send the exact tested commit SHA through SSM. It polls the command until
   `Success` or failure, showing errors in GitHub Actions.

The command **never runs** `docker compose down -v`, drops a database,
deletes annotation rows, rewrites an entire task's timelines, or creates a new
database container if the expected one is absent. The production Compose
project is reused; no task or annotation migration is performed except
explicit, versioned Prisma schema migrations.

## 6. Failures and rollback expectations

- Test/build failure: no production command is sent.
- Missing AWS variables or disabled safety switch: deploy job is skipped.
- Unclean checkout, wrong branch/project, missing Caddyfile, or absent live
  PostgreSQL container: deployment fails **before** database migration.
- Concurrent SSM deployment requests: the host-level lock allows only one
  active deployment script, even outside GitHub's workflow concurrency guard.
- Docker image build failure: old containers remain running.
- Database backup failure: migration and restart are blocked.
- Migration, restart, or health-check failure: GitHub reports failure. **Do
  not automatically revert database migrations or restore a whole database**;
  assess the schema compatibility and use a reviewed recovery plan. The latest
  verified backup is retained in the backup volume.
- For recovery of an individual sponsor, camera, or event annotation, use the
  item-specific revision and isolated restore procedures in
  [the backup guide](../backups/README.md).

Recommended before routine production use: protect the `development` branch
with required reviews/checks, configure offsite encrypted database backups,
test an isolated restore, and configure CloudWatch or other failure alerts.
