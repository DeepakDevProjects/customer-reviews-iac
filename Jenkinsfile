/**
 * ============================================================================
 * FILE: Jenkinsfile
 * PURPOSE: Jenkins Pipeline for Customer Reviews Infrastructure as Code
 * 
 * WHAT THIS PIPELINE DOES:
 * 1. Triggers on config changes or manual trigger
 * 2. Deploys AWS infrastructure using CDK
 * 3. Creates PR-specific AWS resources (S3, Lambda, API Gateway, EventBridge)
 * 4. Uses PR-specific configuration from config/pr-{PR_NUMBER}/config.json
 * 
 * PR-SPECIFIC DEPLOYMENT:
 * - Reads PR config from config/pr-{PR_NUMBER}/config.json
 * - Deploys CloudFormation stack with PR-specific resource names
 * - Outputs resource names and ARNs
 * 
 * TRIGGER:
 * - GitHub webhook on config changes
 * - Manual trigger via Jenkins UI
 * - Called from customer-reviews-app pipeline
 * ============================================================================
 */

pipeline {
    agent any
    
    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }
    
    parameters {
        string(name: 'PR_NUMBER', defaultValue: 'default', description: 'PR number for PR-specific deployment')
    }
    
    environment {
        PR_NUMBER = "${params.PR_NUMBER ?: env.PR_NUMBER ?: 'default'}"
        AWS_CREDENTIALS_ID = 'aws-credentials'
        AWS_REGION = 'us-east-1'
        PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:${env.PATH}"
    }
    
    tools {
        nodejs 'NodeJS-22'
    }
    
    stages {
        stage('Checkout Infrastructure Code') {
            steps {
                script {
                    echo "============================================"
                    echo "Checking out Infrastructure repository"
                    echo "PR Number: ${PR_NUMBER}"
                    echo "============================================"
                }
                checkout scm
            }
        }
        
        stage('Checkout App Code') {
            steps {
                script {
                    echo "============================================"
                    echo "Checking out Customer Reviews App repository"
                    echo "============================================"
                }
                dir('customer-reviews-app') {
                    checkout([
                        $class: 'GitSCM',
                        branches: [[name: '*/main']],
                        userRemoteConfigs: [[
                            url: 'https://github.com/DeepakDevProjects/customer-reviews-app.git',
                            credentialsId: ''
                        ]]
                    ])
                }
            }
        }
        
        stage('Setup Node.js') {
            steps {
                sh '''
                    node --version
                    npm --version
                    echo "Node.js and npm are available"
                '''
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh '''
                    npm install
                    npm list aws-cdk-lib constructs typescript
                '''
            }
        }
        
        stage('Read PR Configuration') {
            steps {
                script {
                    echo "============================================"
                    echo "Reading PR ${PR_NUMBER} configuration"
                    echo "============================================"
                }
                sh '''
                    CONFIG_FILE="config/pr-${PR_NUMBER}/config.json"
                    if [ -f "${CONFIG_FILE}" ]; then
                        echo "Found PR configuration:"
                        cat ${CONFIG_FILE}
                        export PR_CONFIG_EXISTS=true
                    else
                        echo "No PR-specific config found, using default deployment"
                        export PR_CONFIG_EXISTS=false
                    fi
                '''
            }
        }
        
        stage('Bootstrap CDK') {
            when {
                expression { return env.PR_NUMBER == 'default' || env.BOOTSTRAP_CDK == 'true' }
            }
            steps {
                withCredentials([[$class: 'AmazonWebServicesCredentialsBinding', credentialsId: "${AWS_CREDENTIALS_ID}"]]) {
                    sh '''
                        AWS_CLI=$(which aws 2>/dev/null || echo "/opt/homebrew/bin/aws")
                        if [ ! -f "${AWS_CLI}" ]; then
                            AWS_CLI=$(find /opt/homebrew /usr/local /usr -name aws 2>/dev/null | head -1)
                        fi
                        
                        if [ -z "${AWS_CLI}" ] || [ ! -f "${AWS_CLI}" ]; then
                            echo "ERROR: AWS CLI not found"
                            exit 1
                        fi
                        
                        if ! ${AWS_CLI} cloudformation describe-stacks \
                            --stack-name CDKToolkit \
                            --region ${AWS_REGION} 2>/dev/null; then
                            echo "Bootstrapping CDK..."
                            npx cdk bootstrap aws://$(${AWS_CLI} sts get-caller-identity --query Account --output text)/${AWS_REGION}
                        else
                            echo "CDK already bootstrapped"
                        fi
                    '''
                }
            }
        }
        
        stage('Synthesize CDK') {
            steps {
                script {
                    echo "============================================"
                    echo "Synthesizing CloudFormation template"
                    echo "PR Number: ${PR_NUMBER}"
                    echo "============================================"
                }
                sh '''
                    npx cdk synth --context prNumber=${PR_NUMBER} > synth-output.yaml || {
                        echo "CDK synthesis failed"
                        exit 1
                    }
                    echo "CloudFormation template generated successfully"
                '''
            }
        }
        
        stage('Deploy CDK Stack') {
            steps {
                script {
                    echo "============================================"
                    echo "Deploying CDK stack"
                    echo "PR Number: ${PR_NUMBER}"
                    echo "============================================"
                }
                withCredentials([[$class: 'AmazonWebServicesCredentialsBinding', credentialsId: "${AWS_CREDENTIALS_ID}"]]) {
                    sh '''
                        # Read stack name from config if available
                        CONFIG_FILE="config/pr-${PR_NUMBER}/config.json"
                        if [ -f "${CONFIG_FILE}" ]; then
                            STACK_NAME=$(cat ${CONFIG_FILE} | grep -o '"stackName": "[^"]*' | cut -d'"' -f4)
                        else
                            STACK_NAME="CustomerReviewsIacStack-${PR_NUMBER}"
                        fi
                        
                        echo "Deploying stack: ${STACK_NAME}"
                        npx cdk deploy --all --require-approval never --context prNumber=${PR_NUMBER} || {
                            echo "CDK deployment failed"
                            exit 1
                        }
                        
                        echo "Stack ${STACK_NAME} deployed successfully"
                    '''
                }
            }
        }
        
        stage('Display Stack Outputs') {
            steps {
                script {
                    echo "============================================"
                    echo "Stack deployment completed"
                    echo "PR Number: ${PR_NUMBER}"
                    echo "============================================"
                }
                withCredentials([[$class: 'AmazonWebServicesCredentialsBinding', credentialsId: "${AWS_CREDENTIALS_ID}"]]) {
                    sh '''
                        CONFIG_FILE="config/pr-${PR_NUMBER}/config.json"
                        if [ -f "${CONFIG_FILE}" ]; then
                            STACK_NAME=$(cat ${CONFIG_FILE} | grep -o '"stackName": "[^"]*' | cut -d'"' -f4)
                        else
                            STACK_NAME="CustomerReviewsIacStack-${PR_NUMBER}"
                        fi
                        
                        AWS_CLI=$(which aws 2>/dev/null || echo "/opt/homebrew/bin/aws")
                        if [ -f "${AWS_CLI}" ]; then
                            echo "Stack Outputs:"
                            ${AWS_CLI} cloudformation describe-stacks \
                                --stack-name ${STACK_NAME} \
                                --query 'Stacks[0].Outputs' \
                                --output table \
                                --region ${AWS_REGION} || echo "Could not retrieve stack outputs"
                        fi
                    '''
                }
            }
        }
    }
    
    post {
        always {
            echo "Infrastructure pipeline completed for PR ${PR_NUMBER}"
        }
        success {
            echo "✅ Infrastructure deployment succeeded for PR ${PR_NUMBER}"
        }
        failure {
            echo "❌ Infrastructure deployment failed for PR ${PR_NUMBER}"
        }
    }
}

