# Experiment : 9c

## AWS Deployment with Load Balancing

### Aim
To deploy a full-stack application on AWS with load balancing and auto-scaling.

### Objectives
1. Configure AWS infrastructure (VPC, EC2, ALB)
2. Set up auto-scaling group
3. Deploy Docker containers to ECS
4. Configure application load balancer
5. Implement CI/CD pipeline

### About the Program
Demonstrates production-grade deployment on AWS with high availability, load balancing, and auto-scaling capabilities.

---

## Detailed Implementation Steps (Using the existing Next.js + Nginx setup)

This repository is a **Next.js 16** application configured with `output: "export"` in `next.config.ts`, which means the build outputs a fully static site into an `out/` directory. That directory is served via an **unprivileged Nginx** container (`nginxinc/nginx-unprivileged:alpine3.22`) listening on port `8080` — as defined in `nginx.conf` and `Dockerfile`. The steps below walk through deploying this exact setup to AWS using ECS (Fargate), an Application Load Balancer, and CodePipeline — primarily through the **AWS Management Console**.

> **Note**: Two terminal commands are unavoidable — building the Docker image and pushing it to ECR. Everything else is done through the AWS Console.

---

### Prerequisites (No local AWS tools required)

You do not need Docker, Terraform, or the AWS CLI installed on your machine. Everything will be configured directly in your browser using the **AWS Management Console**, relying on CodePipeline to build the Docker image in the cloud.

---

### Step 1: Create an ECR Repository (Console)

Amazon Elastic Container Registry (ECR) will securely store your Docker images.

1. Open the AWS Console → search for **ECR** → click **Elastic Container Registry**.
2. Click **Create repository**.
3. Set the following:
   - **Visibility**: Private
   - **Repository name**: `nextjs-9c-app`
   - **Scan on push**: Enabled
   - **Encryption**: AES-256
4. Click **Create repository**.
5. Note the **URI** of your new repository (e.g. `<account-id>.dkr.ecr.<region>.amazonaws.com/nextjs-9c-app`) for later use.

---

### Step 2: Create the VPC and Networking (Console)

A dedicated VPC isolates the workload across 2 Availability Zones. 

1. Open the AWS Console → search **VPC** → click **Your VPCs** → **Create VPC**.
2. Select **VPC and more**.
3. Configure:
   - **Name tag auto-generation**: `nextjs-9c`
   - **IPv4 CIDR**: `10.0.0.0/16`
   - **Number of Availability Zones**: `2`
   - **Number of public subnets**: `2`
   - **Number of private subnets**: `2`
   - **NAT gateways**: `In 1 AZ` (A NAT Gateway is required so Fargate in private subnets can reach the internet to pull images).
4. Click **Create VPC** and wait for completion.

---

### Step 3: Create Security Groups (Console)

Navigate to **VPC → Security Groups → Create security group**.

**Security Group 1 — ALB (public-facing):**
- **Name**: `nextjs-alb-sg`
- **VPC**: Select `nextjs-9c-vpc`
- **Inbound rules**:
  - Type: `HTTP`, Port: `80`, Source: `0.0.0.0/0`
- Click **Create security group**.

**Security Group 2 — ECS Tasks (private, port 8080 only):**
- **Name**: `nextjs-ecs-sg`
- **VPC**: Select `nextjs-9c-vpc`
- **Inbound rules**:
  - Type: `Custom TCP`, Port: `8080`, Source: Select **Custom** → choose the `nextjs-alb-sg` group (Type "sg-" to find it).
- Click **Create security group**.

---

### Step 4: Create the Application Load Balancer (Console)

Navigate to **EC2 → Load Balancers → Create load balancer**.

1. Choose **Application Load Balancer** → click **Create**.
2. Configure:
   - **Name**: `nextjs-9c-alb`
   - **Scheme**: Internet-facing
   - **VPC**: `nextjs-9c-vpc`
   - **Mappings**: Tick both AZs and select the **2 public subnets**.
   - **Security groups**: Use `nextjs-alb-sg`.
3. Under **Listeners and routing**, click **Create target group** (opens new tab).
   - **Target type**: `IP addresses` (required for Fargate).
   - **Target group name**: `nextjs-9c-tg`
   - **Protocol**: `HTTP`, **Port**: `8080` (matches Next.js Nginx container).
   - **VPC**: `nextjs-9c-vpc`
   - **Health check path**: `/`
   - Click **Next** → leave the exact IP assignments alone (ECS will register targets automatically) → click **Create target group**.
4. Return to the ALB wizard, select `nextjs-9c-tg` as the listener, and click **Create load balancer**.

---

### Step 5: Temporary ECS Setup (Console)

Because we are entirely bypassing local Docker building, we will temporarily start our ECS Service using a generic public image. The CI/CD pipeline will automatically replace this with your Next.js customized image shortly.

**5.1 — Create the ECS Cluster:**
1. Navigate to **ECS → Clusters → Create cluster**.
2. **Cluster name**: `nextjs-9c-cluster`
3. **Infrastructure**: select **AWS Fargate** only → click **Create**.

**5.2 — Create the Task Definition:**
1. Navigate to **ECS → Task Definitions → Create new**.
2. **Family**: `nextjs-9c-task`
3. **Launch type**: Fargate, **OS**: Linux/X86_64, **CPU**: 0.5 vCPU, **Memory**: 1 GB.
4. **Task execution role**: Select or create `ecsTaskExecutionRole`.
5. Under Container 1:
   - **Name**: `nextjs-container` (This must match step 6 exactly).
   - **Image URI**: `nginx:alpine` *(Placeholder image until CodePipeline runs)*.
   - **Container port**: `8080`.
6. Click **Create**.

**5.3 — Create the ECS Service:**
1. Open your cluster → **Services** → **Create**.
2. **Launch type**: Fargate
3. **Task Definition**: `nextjs-9c-task`
4. **Service name**: `nextjs-9c-service`, **Desired tasks**: `2`
5. **Networking**: Select your **2 private VPC subnets** and the `nextjs-ecs-sg` security group. Turn Public IP **Off**.
6. **Load balancing**: Choose **Application Load Balancer** → `nextjs-9c-alb`. Select `nextjs-container` to load balance onto port 8080.
7. Click **Create**.

---

### Step 6: Create the CI/CD Pipeline (Console)

Now we wire GitHub to AWS. When you push, AWS CodeBuild will compile the Next.js app, package it into Docker, send it to ECR, and update the ECS Service we just built.

**6.1 — Add `buildspec.yml` to your project code via GitHub/VSCode:**
Create `buildspec.yml` in the root of your repo:
```yaml
version: 0.2

phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
      # Replace '<your-ecr-uri-here>' below with the URI from Step 1 (e.g. 123456789.dkr.ecr.us-east-1.amazonaws.com/nextjs-9c-app)
      - REPOSITORY_URI=<your-ecr-uri-here>
      - COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)
      - IMAGE_TAG=${COMMIT_HASH:=latest}
  build:
    commands:
      - DOCKER_BUILDKIT=1 docker build -t $REPOSITORY_URI:latest .
      - docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$IMAGE_TAG
  post_build:
    commands:
      - docker push $REPOSITORY_URI:latest
      - docker push $REPOSITORY_URI:$IMAGE_TAG
      - printf '[{"name":"nextjs-container","imageUri":"%s"}]' $REPOSITORY_URI:$IMAGE_TAG > imagedefinitions.json
artifacts:
  files: imagedefinitions.json
```

**6.2 — Setup CodePipeline (Console):**
1. Navigate to **CodePipeline → Create pipeline**.
2. **Name**: `nextjs-9c-pipeline`
3. **Source**: GitHub (Version 2) → Connect your account and select this `9c` repository (branch `main`).
4. **Build**: select **AWS CodeBuild** → click **Create project**
   - Name: `nextjs-build`
   - Image: `aws/codebuild/standard:7.0`
   - ✅ **Privileged mode**: MUST BE CHECKED to allow Docker building.
   - Env variables: Add `AWS_ACCOUNT_ID` with your Account ID number.
   - Go back to IAM, find the newly created codebuild role (e.g. `codebuild-nextjs-build-service-role`) and attach the `AmazonEC2ContainerRegistryPowerUser` policy so it has permission to push to ECR.
5. **Deploy**: select **Amazon ECS**
   - Cluster: `nextjs-9c-cluster`
   - Service: `nextjs-9c-service`
   - Image definitions file: `imagedefinitions.json`
6. Click **Create Pipeline**.

*The pipeline will run immediately, successfully building your Next.js application in CodeBuild, pushing it to ECR, and performing a rolling upgrade on ECS to replace the generic `nginx:alpine` image with your actual app.*

---

### Step 7: Configure Auto-Scaling (Console)

1. Navigate to **ECS → Clusters → nextjs-9c-cluster → Services → nextjs-9c-service**.
2. Click **Update** → scroll to **Service auto scaling** → toggle **Turn on**.
3. **Minimum**: `2`, **Maximum**: `4`
4. Expand **Scaling policies** → click **Add scaling policy**.
5. Select **Target tracking**, Name: `nextjs-cpu-scaling`, Metric: `ECSServiceAverageCPUUtilization`, Target value: `70`.
6. Click **Update** to save.

---

## Expected Output
- Highly available application across **2 AZs**.
- Load-balanced traffic with auto-scaling (**2–4 instances**).
- **Zero-downtime deployments** achieved through ECS rolling updates. All triggered smoothly with zero local environment dependencies.

---

### Step 1: Create the ECR Repository & Push Initial Image

Since the project already has a fully working multi-stage `Dockerfile` with three stages (`dependencies` → `builder` → `runner`), the Docker image can be built and pushed immediately without modification.

**1.1 — Create the ECR repository:**
```bash
aws ecr create-repository \
  --repository-name nextjs-9c-app \
  --region $AWS_REGION \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256
```

**1.2 — Authenticate Docker to ECR:**
```bash
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
```

**1.3 — Build the image locally** (pnpm caching inside the build means this is fast on repeat runs):
```bash
docker build -t nextjs-9c-app .
```
> What happens here: Stage 1 installs pnpm deps with a cache mount. Stage 2 runs `pnpm build`, which calls Next.js to compile the static site into `out/`. Stage 3 copies `out/` into the Nginx HTML directory and applies the custom `nginx.conf` that handles static routing, gzip compression, and aggressive caching of `/_next/` assets.

**1.4 — Tag and push to ECR:**
```bash
export REPO_URI=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/nextjs-9c-app

docker tag nextjs-9c-app:latest $REPO_URI:latest
docker push $REPO_URI:latest
```

**1.5 — Verify the image is in ECR:**
```bash
aws ecr list-images --repository-name nextjs-9c-app
```

---

### Step 2: Provision the VPC and Networking

A custom VPC is required isolating your workloads cleanly across 2 Availability Zones. The ALB lives in the public subnets (internet-facing), and the ECS Fargate tasks live in the private subnets (no direct inbound traffic from the internet).

**2.1 — Create the VPC:**
```bash
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=nextjs-9c-vpc}]' \
  --query Vpc.VpcId --output text)
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames
echo "VPC ID: $VPC_ID"
```

**2.2 — Create 2 Public Subnets (for the ALB):**
```bash
PUB_SUB_1=$(aws ec2 create-subnet --vpc-id $VPC_ID \
  --cidr-block 10.0.1.0/24 --availability-zone ${AWS_REGION}a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=public-1a}]' \
  --query Subnet.SubnetId --output text)

PUB_SUB_2=$(aws ec2 create-subnet --vpc-id $VPC_ID \
  --cidr-block 10.0.2.0/24 --availability-zone ${AWS_REGION}b \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=public-1b}]' \
  --query Subnet.SubnetId --output text)
```

**2.3 — Create 2 Private Subnets (for ECS Tasks):**
```bash
PRIV_SUB_1=$(aws ec2 create-subnet --vpc-id $VPC_ID \
  --cidr-block 10.0.3.0/24 --availability-zone ${AWS_REGION}a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=private-1a}]' \
  --query Subnet.SubnetId --output text)

PRIV_SUB_2=$(aws ec2 create-subnet --vpc-id $VPC_ID \
  --cidr-block 10.0.4.0/24 --availability-zone ${AWS_REGION}b \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=private-1b}]' \
  --query Subnet.SubnetId --output text)
```

**2.4 — Internet Gateway & Route Table (for the public subnets):**
```bash
IGW_ID=$(aws ec2 create-internet-gateway \
  --query InternetGateway.InternetGatewayId --output text)
aws ec2 attach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID

PUB_RT=$(aws ec2 create-route-table --vpc-id $VPC_ID \
  --query RouteTable.RouteTableId --output text)
aws ec2 create-route --route-table-id $PUB_RT \
  --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID
aws ec2 associate-route-table --route-table-id $PUB_RT --subnet-id $PUB_SUB_1
aws ec2 associate-route-table --route-table-id $PUB_RT --subnet-id $PUB_SUB_2
```

**2.5 — NAT Gateway (so ECS tasks in private subnets can pull from ECR):**
```bash
EIP=$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)
NAT_GW=$(aws ec2 create-nat-gateway --subnet-id $PUB_SUB_1 \
  --allocation-id $EIP --query NatGateway.NatGatewayId --output text)
# Wait for NAT gateway to become available
aws ec2 wait nat-gateway-available --nat-gateway-ids $NAT_GW

PRIV_RT=$(aws ec2 create-route-table --vpc-id $VPC_ID \
  --query RouteTable.RouteTableId --output text)
aws ec2 create-route --route-table-id $PRIV_RT \
  --destination-cidr-block 0.0.0.0/0 --nat-gateway-id $NAT_GW
aws ec2 associate-route-table --route-table-id $PRIV_RT --subnet-id $PRIV_SUB_1
aws ec2 associate-route-table --route-table-id $PRIV_RT --subnet-id $PRIV_SUB_2
```

---

### Step 3: Create Security Groups

Two security groups control traffic flow: one for the ALB (accepts public HTTP/HTTPS), and one for the ECS tasks (only accepts traffic from the ALB).

**3.1 — ALB Security Group (public-facing):**
```bash
ALB_SG=$(aws ec2 create-security-group \
  --group-name nextjs-alb-sg \
  --description "ALB security group - allow HTTP/HTTPS from internet" \
  --vpc-id $VPC_ID --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id $ALB_SG \
  --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $ALB_SG \
  --protocol tcp --port 443 --cidr 0.0.0.0/0
```

**3.2 — ECS Task Security Group (only from ALB on port 8080):**

Port `8080` is used here because the Nginx runner stage in the `Dockerfile` exposes port `8080`, and `nginx.conf` has the server listening on `listen 8080`.

```bash
ECS_SG=$(aws ec2 create-security-group \
  --group-name nextjs-ecs-sg \
  --description "ECS tasks - only allow traffic from ALB on port 8080" \
  --vpc-id $VPC_ID --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id $ECS_SG \
  --protocol tcp --port 8080 --source-group $ALB_SG
```

---

### Step 4: Configure the Application Load Balancer (ALB)

**4.1 — Create the ALB in public subnets:**
```bash
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name nextjs-9c-alb \
  --subnets $PUB_SUB_1 $PUB_SUB_2 \
  --security-groups $ALB_SG \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4 \
  --query LoadBalancers[0].LoadBalancerArn --output text)
echo "ALB ARN: $ALB_ARN"
```

**4.2 — Create the Target Group pointing to port 8080:**

The health check path is `/` because your Nginx config serves `index.html` at the root, and Next.js static export always produces an `index.html`.
```bash
TG_ARN=$(aws elbv2 create-target-group \
  --name nextjs-9c-tg \
  --protocol HTTP \
  --port 8080 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-protocol HTTP \
  --health-check-path / \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --query TargetGroups[0].TargetGroupArn --output text)
echo "Target Group ARN: $TG_ARN"
```

**4.3 — Create an ALB Listener on port 80 forwarding to the Target Group:**
```bash
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN
```

**4.4 — Get the ALB DNS name to access the app:**
```bash
aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --query LoadBalancers[0].DNSName --output text
```

---

### Step 5: Create ECS Cluster, Task Definition & Service

**5.1 — Create the ECS cluster:**
```bash
aws ecs create-cluster --cluster-name nextjs-9c-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1
```

**5.2 — Create an IAM Execution Role for ECS** (allows Fargate to pull from ECR and write logs):
```bash
aws iam create-role --role-name ecsTaskExecutionRole \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"Service":"ecs-tasks.amazonaws.com"},
      "Action":"sts:AssumeRole"
    }]
  }'

aws iam attach-role-policy --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

**5.3 — Create a CloudWatch Log Group for container logs:**
```bash
aws logs create-log-group --log-group-name /ecs/nextjs-9c-app
```

**5.4 — Register the ECS Task Definition:**

The container name `nextjs-container` must match exactly what you later put in `buildspec.yml` for the `imagedefinitions.json` to work correctly.

```bash
aws ecs register-task-definition \
  --family nextjs-9c-task \
  --network-mode awsvpc \
  --requires-compatibilities FARGATE \
  --cpu 512 \
  --memory 1024 \
  --execution-role-arn arn:aws:iam::$AWS_ACCOUNT_ID:role/ecsTaskExecutionRole \
  --container-definitions "[
    {
      \"name\": \"nextjs-container\",
      \"image\": \"$REPO_URI:latest\",
      \"portMappings\": [
        {
          \"containerPort\": 8080,
          \"protocol\": \"tcp\"
        }
      ],
      \"essential\": true,
      \"logConfiguration\": {
        \"logDriver\": \"awslogs\",
        \"options\": {
          \"awslogs-group\": \"/ecs/nextjs-9c-app\",
          \"awslogs-region\": \"$AWS_REGION\",
          \"awslogs-stream-prefix\": \"ecs\"
        }
      },
      \"healthCheck\": {
        \"command\": [\"CMD-SHELL\", \"wget -qO- http://localhost:8080/ || exit 1\"],
        \"interval\": 30,
        \"timeout\": 5,
        \"retries\": 3
      }
    }
  ]"
```

**5.5 — Create the ECS Service attached to the ALB:**
```bash
aws ecs create-service \
  --cluster nextjs-9c-cluster \
  --service-name nextjs-9c-service \
  --task-definition nextjs-9c-task \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={
    subnets=[$PRIV_SUB_1,$PRIV_SUB_2],
    securityGroups=[$ECS_SG],
    assignPublicIp=DISABLED
  }" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=nextjs-container,containerPort=8080" \
  --deployment-configuration "minimumHealthyPercent=100,maximumPercent=200" \
  --health-check-grace-period-seconds 60
```

---

### Step 6: Configure Auto-Scaling (2–4 Tasks Based on CPU)

**6.1 — Register the ECS Service as a scalable target:**
```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/nextjs-9c-cluster/nextjs-9c-service \
  --min-capacity 2 \
  --max-capacity 4
```

**6.2 — Create a Target Tracking Scaling Policy on CPU:**

This keeps the average CPU utilization across all running tasks at around 70%. If load pushes tasks above that, Fargate launches new ones up to 4. When load drops, it scales back down to 2.

```bash
aws application-autoscaling put-scaling-policy \
  --policy-name nextjs-cpu-scaling \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/nextjs-9c-cluster/nextjs-9c-service \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'
```

---

### Step 7: Set Up the CI/CD Pipeline (CodePipeline + CodeBuild)

**7.1 — Create the `buildspec.yml` file at the root of this project:**

```yaml
version: 0.2

phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
      - REPOSITORY_URI=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/nextjs-9c-app
      - COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)
      - IMAGE_TAG=${COMMIT_HASH:=latest}
      - echo "Building image tag $IMAGE_TAG from commit $COMMIT_HASH"

  build:
    commands:
      - echo Build started at $(date)
      - echo Building multi-stage Docker image...
      # Docker BuildKit enables pnpm cache mounts defined in the Dockerfile
      - DOCKER_BUILDKIT=1 docker build -t $REPOSITORY_URI:latest .
      - docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$IMAGE_TAG

  post_build:
    commands:
      - echo Build completed at $(date)
      - echo Pushing Docker image to ECR...
      - docker push $REPOSITORY_URI:latest
      - docker push $REPOSITORY_URI:$IMAGE_TAG
      - echo Writing imagedefinitions.json...
      # "nextjs-container" MUST match the container name in the ECS Task Definition (Step 5.4)
      - printf '[{"name":"nextjs-container","imageUri":"%s"}]' $REPOSITORY_URI:$IMAGE_TAG > imagedefinitions.json
      - cat imagedefinitions.json

artifacts:
  files:
    - imagedefinitions.json
```

**7.2 — Create an S3 bucket for pipeline artifacts:**
```bash
aws s3 mb s3://nextjs-9c-pipeline-artifacts-$AWS_ACCOUNT_ID --region $AWS_REGION
```

**7.3 — Create IAM role for CodePipeline:**
```bash
aws iam create-role --role-name CodePipelineRole \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"Service":"codepipeline.amazonaws.com"},
      "Action":"sts:AssumeRole"
    }]
  }'
aws iam attach-role-policy --role-name CodePipelineRole \
  --policy-arn arn:aws:iam::aws:policy/AWSCodePipeline_FullAccess
```

**7.4 — Create CodePipeline via AWS Console:**

1. Go to **AWS CodePipeline → Create pipeline**
2. **Pipeline name**: `nextjs-9c-pipeline`; use the `CodePipelineRole` created above.
3. **Source Stage**:
   - Provider: **GitHub (Version 2)**
   - Connect your GitHub account → select this repository → Branch: `main`
   - Detection: **AWS CodeConnections** (automatic on push)
4. **Build Stage**:
   - Provider: **AWS CodeBuild**
   - Create a new project `nextjs-9c-build`:
     - Environment: **Managed image**, OS: Amazon Linux, Runtime: Standard, Image: `aws/codebuild/standard:7.0`
     - Privileged mode: **Enabled** (required to run Docker commands)
     - Environment variables: `AWS_ACCOUNT_ID` = your account ID
     - Buildspec: **Use a buildspec file** (it will detect `buildspec.yml` at the project root automatically)
5. **Deploy Stage**:
   - Provider: **Amazon ECS**
   - Cluster: `nextjs-9c-cluster`
   - Service: `nextjs-9c-service`
   - Image definitions file: `imagedefinitions.json`

Every `git push origin main` will now automatically build a new Docker image, push it to ECR, and deploy a rolling update to ECS — replacing Nginx containers one at a time while the ALB keeps serving live traffic.

---

### Step 8: Verify the Deployment

**8.1 — Check ECS tasks are running:**
```bash
aws ecs list-tasks --cluster nextjs-9c-cluster --service-name nextjs-9c-service
```

**8.2 — Check target group health (both tasks should be `healthy`):**
```bash
aws elbv2 describe-target-health --target-group-arn $TG_ARN
```

**8.3 — Get the ALB URL and open the app:**
```bash
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --query LoadBalancers[0].DNSName --output text)
echo "Application URL: http://$ALB_DNS"
curl -I http://$ALB_DNS
```

**8.4 — View live container logs:**
```bash
aws logs tail /ecs/nextjs-9c-app --follow
```

---

## Expected Output
- Highly available application across **2 AZs**.
- Load-balanced traffic with auto-scaling (**2–4 instances**) governed by CPU utilization.
- **Zero-downtime deployments** achieved through ECS rolling updates triggered by any `git push` to `main`.
- Infrastructure managed entirely via **Infrastructure as Code (IaC)**.