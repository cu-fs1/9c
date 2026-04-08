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
