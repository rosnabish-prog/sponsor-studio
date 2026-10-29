# Sponsor Studio AWS deployment outline

No AWS resources have been created by this repository. Production infrastructure must be deployed into the customer's own AWS account under a scoped deployment role; never commit access keys, CloudFront private keys, password reset links, or production database credentials.

Recommended production layout:

1. Build `apps/api/Dockerfile` from the repository root and push its default API image and its `--target migrations` image to ECR as separately tagged images. The migration image includes the Prisma CLI and schema; the API image intentionally does not.
2. Run the NestJS API in ECS Fargate in private subnets. Give the ECS task only `S3` multipart permissions for the video prefix. Give it access to Secrets Manager credentials, not long-lived AWS keys.
3. Use RDS PostgreSQL in private subnets. Enable automated backups, encryption, deletion protection, rotation, and security groups that only permit the API and migrations task. Use a separate limited database user for the runtime.
4. Run the `migrations` image as a one-shot ECS task, using the same revision and database secret as the API, **before** updating ECS services. Migrations must complete successfully before rollout. Do not attempt `npm run db:deploy` inside the default API image because its dev-only Prisma CLI is absent.
5. Serve the React production build behind CloudFront (S3 private origin with OAC). Proxy `/api/*` to the API origin via ALB. Use the same browser origin for API and UI so HTTP-only `SameSite=Strict` cookies work reliably. Set `APP_ORIGIN` to that HTTPS origin.
6. Configure the video S3 bucket and a **separate** CloudFront video distribution with OAC, restricted viewer access via trusted key group and private signed playback URLs. For media CORS and key-pair settings, see [API README](../../apps/api/README.md).
7. Deliver API secrets through Secrets Manager / ECS task environment injection: `DATABASE_URL`, `APP_ORIGIN`, `S3_VIDEO_BUCKET`, `AWS_REGION`, `CLOUDFRONT_VIDEO_DOMAIN`, `CLOUDFRONT_KEY_PAIR_ID`, `CLOUDFRONT_PRIVATE_KEY`.
8. Set up Route 53, ACM certificates, CloudWatch logs, error alerts, S3 storage lifecycle, RDS alarms, application rate-limiting/WAF, and restore drills before taking customer data.

CloudFront video signing keys must be generated and stored outside source control. Access to uploaded videos is mediated by API authorization and time-limited CloudFront signatures; S3 objects remain private.

The two AWS domains (the app origin and video CDN domain) are placeholders until a domain, AWS region, account, and certificate strategy are chosen. This document is deployment guidance, not a statement that AWS is live.
