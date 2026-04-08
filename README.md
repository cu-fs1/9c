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

This repository contains a containerized Next.js frontend configured for static export (`output: "export"`), served securely via Nginx on port `8080`. The following outlines exactly how to deploy this specific setup to AWS using ECS (Fargate), an Application Load Balancer, and CodePipeline.

### Step 1: Prepare the ECR Repository & Base Image
Since you already have a robust multi-stage `Dockerfile`, we first need to set up a registry to host it on AWS.
1. Authenticate Docker to your Amazon ECR:
   ```bash
   aws ecr get-login-password --region <your-region> | docker login --username AWS --password-stdin <aws_account_id>.dkr.ecr.<your-region>.amazonaws.com
   ```
2. Create your ECR repository:
   ```bash
   aws ecr create-repository --repository-name nextjs-9c-app
   ```
3. Build and push your first image manually to test:
   ```bash
   docker build -t nextjs-9c-app .
   docker tag nextjs-9c-app:latest <aws_account_id>.dkr.ecr.<your-region>.amazonaws.com/nextjs-9c-app:latest
   docker push <aws_account_id>.dkr.ecr.<your-region>.amazonaws.com/nextjs-9c-app:latest
   ```

### Step 2: Infrastructure Configuration (VPC, ALB, and ECS)
Using Terraform (or the AWS Console), ensure your infrastructure aligns perfectly with this Next.js project setup:
1. **VPC Settings**: Create a VPC with 2 Public Subnets (for the ALB) and 2 Private Subnets (for ECS Tasks) to guarantee multi-AZ high availability.
2. **Application Load Balancer (ALB)**: 
   - Place the ALB in the Public Subnets.
   - Create a **Target Group** (Type: `IP` for Fargate networking).
   - **CRITICAL**: Set the Target Group protocol to `HTTP` and port to `8080` (this matches the `EXPOSE 8080` set natively in your Nginx stage).
   - Configure the ALB Listener on port `80` to forward incoming traffic directly to this Target Group.
3. **ECS Cluster & Task Definition**:
   - Create an ECS Cluster utilizing AWS Fargate.
   - Define a Task Definition mapping to the ECR image URI created in Step 1.
   - **Network Mode**: `awsvpc`.
   - **Container Port Mapping**: Map Container Port `8080` to Host Port `8080`. Let Fargate handle the rest.
4. **ECS Service & Auto-Scaling setup**:
   - Deploy your Task Definition as a Service targeting your chosen Private Subnets to keep it unexposed to the open internet (traffic must pass through the ALB).
   - Link the Service to the target group from Step 2.
   - **Auto-Scaling**: Set the Application Auto Scaling to keep minimum tasks at `2` and max at `4`. Tie this to a target tracking policy based on `ECSServiceAverageCPUUtilization` at 70%.

### Step 3: Implement CI/CD CodePipeline
Automate future deployment updates directly from this GitHub repo:
1. **Create a `buildspec.yml` file** at the root of your project:
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
     build:
       commands:
         - echo Building the Next.js Nginx Docker image...
         - docker build -t $REPOSITORY_URI:latest .
         - docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$IMAGE_TAG
     post_build:
       commands:
         - echo Pushing the Docker image...
         - docker push $REPOSITORY_URI:latest
         - docker push $REPOSITORY_URI:$IMAGE_TAG
         - echo Writing image definitions file...
         # MAKE SURE "nextjs-container" MATCHES EXACTLY the container name found in your ECS Task Definition
         - printf '[{"name":"nextjs-container","imageUri":"%s"}]' $REPOSITORY_URI:$IMAGE_TAG > imagedefinitions.json
   artifacts:
     files: imagedefinitions.json
   ```
2. **Setup AWS CodePipeline**:
   - **Source**: Connect GitHub (trigger on branch `main`).
   - **Build**: Use AWS CodeBuild (it automatically detects the `buildspec.yml` above to build your new Nginx static assets and push them securely to ECR).
   - **Deploy**: Choose Amazon ECS. Provide your Cluster name, Service name, and select the output artifact `imagedefinitions.json`. CodeDeploy will perform rolling updates replacing old Nginx containers with new ones.

---

## Expected Output
- Highly available application across **2 AZs**.
- Load-balanced traffic with auto-scaling (**2–4 instances**).
- **Zero-downtime deployments** achieved through ECS rolling updates.
- Infrastructure managed entirely via **Infrastructure as Code (IaC)**.